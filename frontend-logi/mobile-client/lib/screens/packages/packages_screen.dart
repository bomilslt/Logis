import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../models/package.dart';
import '../../services/api_service.dart';
import '../widgets/package_card.dart';

class PackagesScreen extends StatefulWidget {
  const PackagesScreen({super.key});

  @override
  State<PackagesScreen> createState() => _PackagesScreenState();
}

class _PackagesScreenState extends State<PackagesScreen> {
  final _searchCtrl = TextEditingController();
  List<Package> _packages = [];
  int _page = 1;
  String _statusFilter = '';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPackages();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPackages({bool refresh = false}) async {
    if (refresh) _page = 1;
    setState(() { _loading = true; _error = null; });

    try {
      final api = context.read<ApiService>();
      final data = await api.getPackages(
        page: _page,
        perPage: 20,
        status: _statusFilter.isNotEmpty ? _statusFilter : null,
        search: _searchCtrl.text.isNotEmpty ? _searchCtrl.text : null,
      );
      if (mounted) {
        setState(() {
          _packages = ((data['packages'] ?? []) as List).map((p) => Package.fromJson(p)).toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes colis'),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.plus, size: 22),
            onPressed: () => context.push('/new-package'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search & filter bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchCtrl,
                    decoration: InputDecoration(
                      hintText: 'Rechercher...',
                      prefixIcon: const Icon(LucideIcons.search, size: 18),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      suffixIcon: _searchCtrl.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(LucideIcons.x, size: 16),
                              onPressed: () {
                                _searchCtrl.clear();
                                _loadPackages(refresh: true);
                              },
                            )
                          : null,
                    ),
                    onSubmitted: (_) => _loadPackages(refresh: true),
                  ),
                ),
                const SizedBox(width: 8),
                PopupMenuButton<String>(
                  icon: const Icon(LucideIcons.filter, size: 20),
                  onSelected: (status) {
                    setState(() => _statusFilter = status);
                    _loadPackages(refresh: true);
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: '', child: Text('Tous les statuts')),
                    ...AppConfig.packageStatuses.entries.map((e) =>
                      PopupMenuItem(value: e.key, child: Text(e.value.label)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (_statusFilter.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Chip(
                    label: Text(AppConfig.packageStatuses[_statusFilter]?.label ?? _statusFilter),
                    deleteIcon: const Icon(LucideIcons.x, size: 14),
                    onDeleted: () {
                      setState(() => _statusFilter = '');
                      _loadPackages(refresh: true);
                    },
                  ),
                ],
              ),
            ),
          // Package list
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.alertCircle, size: 48, color: AppColors.error),
                            const SizedBox(height: 12),
                            Text(_error!, style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 12),
                            ElevatedButton(onPressed: () => _loadPackages(refresh: true), child: const Text('Réessayer')),
                          ],
                        ),
                      )
                    : _packages.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(LucideIcons.package2, size: 48, color: AppColors.textMuted),
                                const SizedBox(height: 12),
                                Text('Aucun colis trouvé', style: Theme.of(context).textTheme.titleMedium),
                                const SizedBox(height: 4),
                                Text(
                                  _searchCtrl.text.isNotEmpty || _statusFilter.isNotEmpty
                                      ? 'Essayez de modifier vos filtres'
                                      : 'Commencez par créer votre premier colis',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: () => _loadPackages(refresh: true),
                            child: ListView.builder(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              itemCount: _packages.length,
                              itemBuilder: (_, i) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: PackageCard(
                                  package: _packages[i],
                                  onTap: () => context.push('/packages/${_packages[i].id}'),
                                ),
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
