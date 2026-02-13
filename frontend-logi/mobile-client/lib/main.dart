import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'config/theme.dart';
import 'config/router.dart';
import 'services/api_service.dart';
import 'providers/auth_provider.dart';
import 'screens/splash_screen.dart';
import 'config/tenant_features.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  runApp(const ExpressCargoApp());
}

class ExpressCargoApp extends StatefulWidget {
  const ExpressCargoApp({super.key});

  @override
  State<ExpressCargoApp> createState() => _ExpressCargoAppState();
}

class _ExpressCargoAppState extends State<ExpressCargoApp> {
  late final ApiService _apiService;
  late final AuthProvider _authProvider;
  bool _showSplash = true;

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _authProvider = AuthProvider(api: _apiService);
    _initApp();
  }

  Future<void> _initApp() async {
    await _authProvider.init();
    // Load tenant features (online_payments, etc.)
    await TenantFeatures.instance.load(_apiService);
    // Show splash for at least 2s for a smooth experience
    await Future.delayed(const Duration(milliseconds: 2000));
    if (mounted) setState(() => _showSplash = false);
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: _apiService),
        ChangeNotifierProvider<AuthProvider>.value(value: _authProvider),
      ],
      child: MaterialApp(
        title: 'Express Cargo',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.system,
        home: _showSplash
            ? const SplashScreen()
            : const _AppRouter(),
      ),
    );
  }
}

class _AppRouter extends StatelessWidget {
  const _AppRouter();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final router = createRouter(auth);
    return MaterialApp.router(
      title: 'Express Cargo',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
