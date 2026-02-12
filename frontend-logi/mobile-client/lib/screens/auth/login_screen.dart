import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  bool _otpMode = false; // true = OTP login flow
  bool _otpSent = false; // true = OTP code sent, waiting for code input

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      await context.read<AuthProvider>().login(
        _emailCtrl.text.trim(),
        _passwordCtrl.text,
      );
      if (mounted) context.go('/dashboard');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_extractError(e)), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleRequestOtp() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Entrez votre email d\'abord'), backgroundColor: AppColors.warning),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<ApiService>().requestOtp(email: email, purpose: 'login');
      if (mounted) setState(() => _otpSent = true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_extractError(e)), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleVerifyOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.isEmpty || code.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Entrez le code reçu par email'), backgroundColor: AppColors.warning),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      final data = await context.read<ApiService>().verifyOtp(
        email: _emailCtrl.text.trim(),
        code: code,
        purpose: 'login',
      );
      if (mounted) {
        await context.read<AuthProvider>().loginWithOtp(data);
        context.go('/dashboard');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_extractError(e)), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggleOtpMode() {
    setState(() {
      _otpMode = !_otpMode;
      _otpSent = false;
      _otpCtrl.clear();
    });
  }

  String _extractError(dynamic e) {
    if (e.toString().contains('DioException')) {
      return 'Impossible de contacter le serveur';
    }
    return e.toString().replaceAll('Exception: ', '');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Logo
                  ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: Image.asset(
                      AppConfig.appLogo,
                      width: 80,
                      height: 80,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('Connexion', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 6),
                  Text('Accédez à votre espace client', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary)),
                  const SizedBox(height: 32),

                  // Email
                  TextFormField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Email', hintText: 'votre@email.com'),
                    validator: (v) => v == null || !v.contains('@') ? 'Email invalide' : null,
                  ),
                  const SizedBox(height: 16),

                  if (!_otpMode) ...[
                    // Password login
                    TextFormField(
                      controller: _passwordCtrl,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _handleLogin(),
                      decoration: InputDecoration(
                        labelText: 'Mot de passe',
                        hintText: 'Votre mot de passe',
                        suffixIcon: IconButton(
                          icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, size: 20),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) => v == null || v.isEmpty ? 'Mot de passe requis' : null,
                    ),
                    const SizedBox(height: 24),

                    // Login button
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _handleLogin,
                        child: _loading
                            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Se connecter'),
                      ),
                    ),
                  ] else ...[
                    // OTP login
                    if (!_otpSent) ...[
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: _loading ? null : _handleRequestOtp,
                          child: _loading
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Text('Recevoir le code'),
                        ),
                      ),
                    ] else ...[
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
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: _loading ? null : _handleVerifyOtp,
                          child: _loading
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Text('Vérifier le code'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          onPressed: _loading ? null : _handleRequestOtp,
                          child: const Text('Renvoyer le code'),
                        ),
                      ),
                    ],
                  ],

                  const SizedBox(height: 12),

                  // Divider + OTP toggle
                  Row(children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('ou', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
                    ),
                    const Expanded(child: Divider()),
                  ]),
                  const SizedBox(height: 12),

                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: OutlinedButton.icon(
                      onPressed: _loading ? null : _toggleOtpMode,
                      icon: Icon(_otpMode ? LucideIcons.lock : LucideIcons.shield, size: 18),
                      label: Text(_otpMode ? 'Connexion avec mot de passe' : 'Connexion avec code de vérification'),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Forgot password
                  TextButton(
                    onPressed: () => context.push('/forgot-password'),
                    child: const Text('Mot de passe oublié ?'),
                  ),
                  const SizedBox(height: 8),

                  // Register link
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Pas encore de compte ? ', style: Theme.of(context).textTheme.bodySmall),
                      GestureDetector(
                        onTap: () => context.push('/register'),
                        child: Text('Créer un compte', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),

                  // Personal logo
                  Opacity(
                    opacity: 0.5,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.asset(AppConfig.personalLogo, height: 28, fit: BoxFit.contain),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
