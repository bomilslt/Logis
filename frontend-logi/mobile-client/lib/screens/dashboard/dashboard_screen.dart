import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../models/package.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../widgets/package_card.dart';
import '../widgets/stat_card.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  PackageStats? _stats;
  List<Package> _recentPackages = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = context.read<ApiService>();
      final results = await Future.wait([
        api.getPackageStats(),
        api.getPackages(perPage: 5),
      ]);
      if (mounted) {
        setState(() {
          _stats = PackageStats.fromJson(results[0]['stats'] ?? results[0]);
          _recentPackages = ((results[1]['packages'] ?? []) as List)
              .map((p) => Package.fromJson(p))
              .toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Bonjour, ${user?.firstName ?? 'Client'}', style: Theme.of(context).textTheme.headlineSmall),
            Text('Voici un aperçu de vos expéditions', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        toolbarHeight: 64,
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.bell, size: 22),
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: const Icon(LucideIcons.user, size: 22),
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildError()
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildStats(),
                      const SizedBox(height: 8),
                      Text('Statistiques des 3 derniers mois', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted)),
                      const SizedBox(height: 24),
                      _buildRecentSection(),
                    ],
                  ),
                ),
    );
  }

  Widget _buildStats() {
    final s = _stats ?? PackageStats();
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        StatCard(label: 'Total', value: s.total, icon: LucideIcons.package2, color: AppColors.primary, bgColor: AppColors.primaryBg),
        StatCard(label: 'En attente', value: s.pending, icon: LucideIcons.clock, color: AppColors.warning, bgColor: AppColors.warningBg),
        StatCard(label: 'En transit', value: s.inTransit, icon: LucideIcons.truck, color: AppColors.info, bgColor: AppColors.infoBg),
        StatCard(label: 'Livrés', value: s.delivered, icon: LucideIcons.checkCircle, color: AppColors.success, bgColor: AppColors.successBg),
      ],
    );
  }

  Widget _buildRecentSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Derniers colis', style: Theme.of(context).textTheme.titleLarge),
            TextButton.icon(
              onPressed: () => context.go('/history'),
              icon: const Text('Historique'),
              label: const Icon(LucideIcons.chevronRight, size: 16),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_recentPackages.isEmpty)
          _buildEmpty()
        else
          ..._recentPackages.map((p) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: PackageCard(
              package: p,
              onTap: () => context.push('/packages/${p.id}'),
            ),
          )),
      ],
    );
  }

  Widget _buildEmpty() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          children: [
            const Icon(LucideIcons.package2, size: 48, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text('Aucun colis', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Aucun colis pour cette période', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: () => context.go('/new-package'), child: const Text('Créer un colis')),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.alertCircle, size: 48, color: AppColors.error),
            const SizedBox(height: 12),
            Text('Erreur de chargement', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(_error ?? '', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _loadData, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}
