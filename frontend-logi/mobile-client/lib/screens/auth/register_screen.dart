import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      await context.read<AuthProvider>().register(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        firstName: _firstNameCtrl.text.trim(),
        lastName: _lastNameCtrl.text.trim(),
        phone: _phoneCtrl.text.trim().isNotEmpty ? _phoneCtrl.text.trim() : null,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Compte créé avec succès'), backgroundColor: AppColors.success),
        );
        context.go('/dashboard');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(leading: const BackButton()),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: Image.asset(AppConfig.appLogo, width: 64, height: 64, fit: BoxFit.cover),
                  ),
                ),
                const SizedBox(height: 16),
                Text('Créer un compte', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 6),
                Text('Rejoignez Express Cargo', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary)),
                const SizedBox(height: 28),

                Row(children: [
                  Expanded(child: TextFormField(
                    controller: _firstNameCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Prénom'),
                    validator: (v) => v == null || v.isEmpty ? 'Requis' : null,
                  )),
                  const SizedBox(width: 12),
                  Expanded(child: TextFormField(
                    controller: _lastNameCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Nom'),
                    validator: (v) => v == null || v.isEmpty ? 'Requis' : null,
                  )),
                ]),
                const SizedBox(height: 16),

                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'Email', hintText: 'votre@email.com'),
                  validator: (v) => v == null || !v.contains('@') ? 'Email invalide' : null,
                ),
                const SizedBox(height: 16),

                TextFormField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'Téléphone (optionnel)', hintText: '+237 6XX XXX XXX'),
                ),
                const SizedBox(height: 16),

                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _handleRegister(),
                  decoration: InputDecoration(
                    labelText: 'Mot de passe',
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) => v == null || v.length < 6 ? 'Min. 6 caractères' : null,
                ),
                const SizedBox(height: 28),

                SizedBox(
                  height: 50,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _handleRegister,
                    child: _loading
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Créer mon compte'),
                  ),
                ),
                const SizedBox(height: 16),

                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('Déjà un compte ? ', style: Theme.of(context).textTheme.bodySmall),
                  GestureDetector(
                    onTap: () => context.go('/login'),
                    child: Text('Se connecter', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
                  ),
                ]),
                const SizedBox(height: 24),
                Center(
                  child: Opacity(
                    opacity: 0.5,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.asset(AppConfig.personalLogo, height: 28, fit: BoxFit.contain),
                    ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
