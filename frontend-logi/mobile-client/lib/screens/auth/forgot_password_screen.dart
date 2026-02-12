import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  // Steps: email → otp → reset → success
  String _step = 'email';

  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _loading = false;
  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  String? _verificationToken;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.error),
    );
  }

  void _showWarning(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.warning),
    );
  }

  // Step 1: Request OTP
  Future<void> _handleRequestOtp() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      _showWarning('Entrez un email valide');
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<ApiService>().requestOtp(email: email, purpose: 'reset_password');
      if (mounted) setState(() => _step = 'otp');
    } catch (e) {
      _showError(e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Step 2: Verify OTP code
  Future<void> _handleVerifyOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.isEmpty || code.length < 4) {
      _showWarning('Entrez le code reçu par email');
      return;
    }

    setState(() => _loading = true);
    try {
      final data = await context.read<ApiService>().verifyOtp(
        email: _emailCtrl.text.trim(),
        code: code,
        purpose: 'reset_password',
      );
      _verificationToken = data['verification_token'];
      if (mounted) setState(() => _step = 'reset');
    } catch (e) {
      _showError(e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Step 3: Reset password
  Future<void> _handleResetPassword() async {
    final password = _passwordCtrl.text;
    final confirm = _confirmCtrl.text;

    if (password.length < 6) {
      _showWarning('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (password != confirm) {
      _showWarning('Les mots de passe ne correspondent pas');
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<ApiService>().resetPassword(
        _emailCtrl.text.trim(),
        password,
        _verificationToken!,
      );
      if (mounted) setState(() => _step = 'success');
    } catch (e) {
      _showError(e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Resend OTP
  Future<void> _handleResendOtp() async {
    setState(() => _loading = true);
    try {
      await context.read<ApiService>().requestOtp(email: _emailCtrl.text.trim(), purpose: 'reset_password');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Code renvoyé'), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      _showError(e.toString().replaceAll('Exception: ', ''));
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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              _buildHeader(),
              const SizedBox(height: 32),
              _buildStepContent(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    IconData icon;
    String title;
    String subtitle;

    switch (_step) {
      case 'otp':
        icon = LucideIcons.mailCheck;
        title = 'Vérification';
        subtitle = 'Entrez le code envoyé à ${_emailCtrl.text.trim()}';
        break;
      case 'reset':
        icon = LucideIcons.lock;
        title = 'Nouveau mot de passe';
        subtitle = 'Choisissez votre nouveau mot de passe';
        break;
      case 'success':
        icon = LucideIcons.checkCircle;
        title = 'Mot de passe modifié';
        subtitle = 'Votre mot de passe a été réinitialisé avec succès';
        break;
      default:
        return Column(children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.asset(AppConfig.appLogo, width: 64, height: 64, fit: BoxFit.cover),
            ),
          ),
          const SizedBox(height: 20),
          Text('Mot de passe oublié', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            'Entrez votre email pour recevoir un code de réinitialisation',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
        ]);
    }

    return Column(children: [
      Center(child: Icon(icon, size: 48, color: _step == 'success' ? AppColors.success : AppColors.primary)),
      const SizedBox(height: 20),
      Text(title, style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
      const SizedBox(height: 8),
      Text(subtitle, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary), textAlign: TextAlign.center),
    ]);
  }

  Widget _buildStepContent() {
    switch (_step) {
      case 'otp':
        return _buildOtpStep();
      case 'reset':
        return _buildResetStep();
      case 'success':
        return _buildSuccessStep();
      default:
        return _buildEmailStep();
    }
  }

  Widget _buildEmailStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextFormField(
        controller: _emailCtrl,
        keyboardType: TextInputType.emailAddress,
        textInputAction: TextInputAction.done,
        onFieldSubmitted: (_) => _handleRequestOtp(),
        decoration: const InputDecoration(labelText: 'Email', hintText: 'votre@email.com'),
      ),
      const SizedBox(height: 24),
      SizedBox(
        height: 50,
        child: ElevatedButton(
          onPressed: _loading ? null : _handleRequestOtp,
          child: _loading
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Envoyer le code'),
        ),
      ),
    ]);
  }

  Widget _buildOtpStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextFormField(
        controller: _otpCtrl,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        onFieldSubmitted: (_) => _handleVerifyOtp(),
        autofocus: true,
        style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.bold),
        textAlign: TextAlign.center,
        decoration: const InputDecoration(
          labelText: 'Code de vérification',
          hintText: '000000',
          counterText: '',
        ),
        maxLength: 6,
      ),
      const SizedBox(height: 24),
      SizedBox(
        height: 50,
        child: ElevatedButton(
          onPressed: _loading ? null : _handleVerifyOtp,
          child: _loading
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Vérifier le code'),
        ),
      ),
      const SizedBox(height: 16),
      Center(
        child: TextButton(
          onPressed: _loading ? null : _handleResendOtp,
          child: const Text('Renvoyer le code'),
        ),
      ),
    ]);
  }

  Widget _buildResetStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextFormField(
        controller: _passwordCtrl,
        obscureText: _obscurePassword,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(
          labelText: 'Nouveau mot de passe',
          hintText: 'Min. 6 caractères',
          suffixIcon: IconButton(
            icon: Icon(_obscurePassword ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
          ),
        ),
      ),
      const SizedBox(height: 16),
      TextFormField(
        controller: _confirmCtrl,
        obscureText: _obscureConfirm,
        textInputAction: TextInputAction.done,
        onFieldSubmitted: (_) => _handleResetPassword(),
        decoration: InputDecoration(
          labelText: 'Confirmer le mot de passe',
          suffixIcon: IconButton(
            icon: Icon(_obscureConfirm ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
            onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
          ),
        ),
      ),
      const SizedBox(height: 24),
      SizedBox(
        height: 50,
        child: ElevatedButton(
          onPressed: _loading ? null : _handleResetPassword,
          child: _loading
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Réinitialiser'),
        ),
      ),
    ]);
  }

  Widget _buildSuccessStep() {
    return SizedBox(
      height: 50,
      child: ElevatedButton(
        onPressed: () => context.go('/login'),
        child: const Text('Se connecter'),
      ),
    );
  }
}
