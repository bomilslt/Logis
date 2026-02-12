import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../screens/shell_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/auth/forgot_password_screen.dart';
import '../screens/dashboard/dashboard_screen.dart';
import '../screens/packages/packages_screen.dart';
import '../screens/packages/package_detail_screen.dart';
import '../screens/packages/new_package_screen.dart';
import '../screens/track/track_screen.dart';
import '../screens/calculator/calculator_screen.dart';
import '../screens/history/history_screen.dart';
import '../screens/notifications/notifications_screen.dart';
import '../screens/profile/profile_screen.dart';
import '../screens/templates/templates_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createRouter(AuthProvider authProvider) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/dashboard',
    refreshListenable: authProvider,
    redirect: (context, state) {
      final auth = context.read<AuthProvider>();
      final isAuth = auth.isAuthenticated;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/forgot-password';

      if (!auth.isInitialized) return null;
      if (!isAuth && !isAuthRoute) return '/login';
      if (isAuth && isAuthRoute) return '/dashboard';
      return null;
    },
    routes: [
      // Auth routes (no shell)
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(path: '/forgot-password', builder: (_, __) => const ForgotPasswordScreen()),

      // App routes (with bottom nav shell)
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (_, __, child) => ShellScreen(child: child),
        routes: [
          GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
          GoRoute(path: '/packages', builder: (_, __) => const PackagesScreen()),
          GoRoute(path: '/packages/:id', builder: (_, state) => PackageDetailScreen(packageId: state.pathParameters['id']!)),
          GoRoute(path: '/new-package', builder: (_, __) => const NewPackageScreen()),
          GoRoute(path: '/track', builder: (_, __) => const TrackScreen()),
          GoRoute(path: '/calculator', builder: (_, __) => const CalculatorScreen()),
          GoRoute(path: '/history', builder: (_, __) => const HistoryScreen()),
          GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
          GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
          GoRoute(path: '/templates', builder: (_, __) => const TemplatesScreen()),
        ],
      ),
    ],
  );
}
