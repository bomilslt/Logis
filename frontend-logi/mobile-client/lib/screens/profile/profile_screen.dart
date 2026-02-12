import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    if (user != null) {
      _firstNameCtrl.text = user.firstName;
      _lastNameCtrl.text = user.lastName;
      _phoneCtrl.text = user.phone ?? '';
    }
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      await context.read<AuthProvider>().updateProfile({
        'first_name': _firstNameCtrl.text.trim(),
        'last_name': _lastNameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profil mis à jour'), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showChangePasswordDialog() async {
    final currentPwdCtrl = TextEditingController();
    final newPwdCtrl = TextEditingController();
    final confirmPwdCtrl = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Changer le mot de passe'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: currentPwdCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Mot de passe actuel')),
            const SizedBox(height: 12),
            TextField(controller: newPwdCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Nouveau mot de passe')),
            const SizedBox(height: 12),
            TextField(controller: confirmPwdCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Confirmer le mot de passe')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () async {
              if (newPwdCtrl.text != confirmPwdCtrl.text) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Les mots de passe ne correspondent pas'), backgroundColor: AppColors.error),
                );
                return;
              }
              if (newPwdCtrl.text.length < 6) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Le mot de passe doit contenir au moins 6 caractères'), backgroundColor: AppColors.error),
                );
                return;
              }
              try {
                await ctx.read<ApiService>().changePassword(currentPwdCtrl.text, newPwdCtrl.text);
                if (ctx.mounted) Navigator.pop(ctx, true);
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: AppColors.error),
                  );
                }
              }
            },
            child: const Text('Changer'),
          ),
        ],
      ),
    );

    currentPwdCtrl.dispose();
    newPwdCtrl.dispose();
    confirmPwdCtrl.dispose();

    if (result == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mot de passe modifié avec succès'), backgroundColor: AppColors.success),
      );
    }
  }

  Future<void> _handleLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vraiment vous déconnecter ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Se déconnecter'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await context.read<AuthProvider>().logout();
      if (mounted) context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final brightness = Theme.of(context).brightness;

    return Scaffold(
      appBar: AppBar(leading: const BackButton(), title: const Text('Profil')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Avatar
          Center(
            child: Column(children: [
              CircleAvatar(
                radius: 40,
                backgroundColor: AppColors.primaryBg,
                child: Text(user?.initials ?? '', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.primary)),
              ),
              const SizedBox(height: 10),
              Text(user?.fullName ?? '', style: Theme.of(context).textTheme.headlineSmall),
              Text(user?.email ?? '', style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
          const SizedBox(height: 28),

          // Personal info
          _sectionTitle('Informations personnelles'),
          Row(children: [
            Expanded(child: TextFormField(controller: _firstNameCtrl, decoration: const InputDecoration(labelText: 'Prénom'))),
            const SizedBox(width: 12),
            Expanded(child: TextFormField(controller: _lastNameCtrl, decoration: const InputDecoration(labelText: 'Nom'))),
          ]),
          const SizedBox(height: 12),
          TextFormField(controller: _phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Téléphone')),
          const SizedBox(height: 12),
          TextFormField(initialValue: user?.email, enabled: false, decoration: const InputDecoration(labelText: 'Email')),
          const SizedBox(height: 16),
          SizedBox(
            height: 46,
            child: ElevatedButton(
              onPressed: _saving ? null : _saveProfile,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Enregistrer'),
            ),
          ),
          const SizedBox(height: 28),

          // Appearance
          _sectionTitle('Apparence'),
          Card(
            child: SwitchListTile(
              title: const Text('Mode sombre', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              subtitle: Text('Activer le thème sombre', style: Theme.of(context).textTheme.bodySmall),
              value: brightness == Brightness.dark,
              onChanged: (_) {
                // Theme is controlled by system; inform user
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Le thème suit les paramètres système')),
                );
              },
              activeColor: AppColors.primary,
            ),
          ),
          const SizedBox(height: 28),

          // Notifications
          _sectionTitle('Notifications'),
          _toggleTile('Notifications email', 'Recevoir les mises à jour par email', user?.notifyEmail ?? true, (v) {
            context.read<AuthProvider>().updateNotificationSettings({'notify_email': v});
          }),
          _toggleTile('Notifications SMS', 'Recevoir les alertes par SMS', user?.notifySms ?? true, (v) {
            context.read<AuthProvider>().updateNotificationSettings({'notify_sms': v});
          }),
          _toggleTile('Notifications push', 'Recevoir les notifications dans l\'app', user?.notifyPush ?? true, (v) {
            context.read<AuthProvider>().updateNotificationSettings({'notify_push': v});
          }),
          const SizedBox(height: 28),

          // Security
          _sectionTitle('Sécurité'),
          SizedBox(
            height: 46,
            child: OutlinedButton.icon(
              onPressed: _showChangePasswordDialog,
              icon: const Icon(LucideIcons.lock, size: 18),
              label: const Text('Changer le mot de passe'),
            ),
          ),
          const SizedBox(height: 28),

          // Logout
          SizedBox(
            height: 46,
            child: OutlinedButton.icon(
              onPressed: _handleLogout,
              icon: const Icon(LucideIcons.logOut, size: 18, color: AppColors.error),
              label: const Text('Se déconnecter', style: TextStyle(color: AppColors.error)),
              style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.error)),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium),
    );
  }

  Widget _toggleTile(String title, String subtitle, bool value, ValueChanged<bool> onChanged) {
    return Card(
      child: SwitchListTile(
        title: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        subtitle: Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
        value: value,
        onChanged: onChanged,
        activeColor: AppColors.primary,
      ),
    );
  }
}
