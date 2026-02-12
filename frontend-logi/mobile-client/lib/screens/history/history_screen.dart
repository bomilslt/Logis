import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../models/package.dart';
import '../../services/api_service.dart';
import '../widgets/package_card.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<Package> _packages = [];
  bool _loading = true;
  int _page = 1;
  bool _hasMore = true;
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadPackages();
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200 && !_loading && _hasMore) {
      _page++;
      _loadPackages(append: true);
    }
  }

  Future<void> _loadPackages({bool append = false}) async {
    if (!append) setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final data = await api.getPackages(page: _page, perPage: 20);
      final list = ((data['packages'] ?? []) as List).map((p) => Package.fromJson(p)).toList();
      if (mounted) {
        setState(() {
          if (append) {
            _packages.addAll(list);
          } else {
            _packages = list;
          }
          _hasMore = list.length >= 20;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Historique')),
      body: _loading && _packages.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _packages.isEmpty
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(LucideIcons.clock, size: 48, color: AppColors.textMuted),
                    const SizedBox(height: 12),
                    Text('Aucun historique', style: Theme.of(context).textTheme.titleMedium),
                  ]),
                )
              : RefreshIndicator(
                  onRefresh: () async { _page = 1; await _loadPackages(); },
                  child: ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.all(16),
                    itemCount: _packages.length + (_hasMore ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i >= _packages.length) {
                        return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                      }
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: PackageCard(package: _packages[i], onTap: () => context.push('/packages/${_packages[i].id}')),
                      );
                    },
                  ),
                ),
    );
  }
}
