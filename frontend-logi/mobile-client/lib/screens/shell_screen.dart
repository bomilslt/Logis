import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

class ShellScreen extends StatelessWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  static const _tabs = [
    _Tab('/dashboard', 'Accueil', LucideIcons.home),
    _Tab('/packages', 'Colis', LucideIcons.package2),
    _Tab('/new-package', 'Nouveau', LucideIcons.plusCircle),
    _Tab('/track', 'Suivre', LucideIcons.search),
    _Tab('/calculator', 'Tarifs', LucideIcons.calculator),
  ];

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    for (int i = 0; i < _tabs.length; i++) {
      if (location == _tabs[i].path || location.startsWith('${_tabs[i].path}/')) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final idx = _currentIndex(context);
    final hideNav = GoRouterState.of(context).matchedLocation.startsWith('/packages/') ||
        GoRouterState.of(context).matchedLocation == '/notifications' ||
        GoRouterState.of(context).matchedLocation == '/profile';

    return Scaffold(
      body: child,
      bottomNavigationBar: hideNav
          ? null
          : NavigationBar(
              selectedIndex: idx,
              onDestinationSelected: (i) => context.go(_tabs[i].path),
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              height: 64,
              destinations: _tabs.map((t) {
                final isCenter = t.path == '/new-package';
                return NavigationDestination(
                  icon: Icon(t.icon, size: isCenter ? 28 : 22),
                  selectedIcon: Icon(t.icon, size: isCenter ? 28 : 22),
                  label: t.label,
                );
              }).toList(),
            ),
    );
  }
}

class _Tab {
  final String path;
  final String label;
  final IconData icon;
  const _Tab(this.path, this.label, this.icon);
}
