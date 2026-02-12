import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../models/package.dart';
import '../../services/api_service.dart';

class TrackScreen extends StatefulWidget {
  const TrackScreen({super.key});

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> {
  final _trackingCtrl = TextEditingController();
  Package? _result;
  bool _loading = false;
  bool _notFound = false;
  String? _error;

  @override
  void dispose() {
    _trackingCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleTrack() async {
    final tracking = _trackingCtrl.text.trim();
    if (tracking.isEmpty) return;

    setState(() { _loading = true; _result = null; _notFound = false; _error = null; });

    try {
      final api = context.read<ApiService>();
      final data = await api.trackPackage(tracking);
      if (mounted) {
        setState(() {
          _result = Package.fromJson(data['package'] ?? data);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        final msg = e.toString().replaceAll('Exception: ', '');
        final is404 = msg.contains('404') || msg.toLowerCase().contains('not found') || msg.toLowerCase().contains('introuvable');
        setState(() {
          _notFound = true;
          _error = is404
              ? 'Aucun colis trouvé avec ce numéro de suivi. Vérifiez le numéro et réessayez.'
              : msg;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Suivre un colis')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Hero section
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.primary, AppColors.primaryDark]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                const Icon(LucideIcons.search, size: 40, color: Colors.white),
                const SizedBox(height: 12),
                const Text('Suivre un colis', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                const Text('Entrez votre numéro de suivi', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _trackingCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: 'Ex: TB202401150001...',
                          hintStyle: const TextStyle(color: Colors.white38),
                          filled: true,
                          fillColor: Colors.white.withValues(alpha: 0.15),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                          prefixIcon: const Icon(LucideIcons.package2, size: 18, color: Colors.white54),
                          contentPadding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onSubmitted: (_) => _handleTrack(),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _handleTrack,
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.primary),
                        child: _loading
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Rechercher'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Result
          if (_result != null) _buildResult(),
          if (_notFound) _buildNotFound(),

          // Help section
          if (_result == null && !_notFound) ...[
            const SizedBox(height: 16),
            _buildHelpSection(),
            const SizedBox(height: 20),
            _buildStatusLegend(),
          ],
        ],
      ),
    );
  }

  Widget _buildResult() {
    final pkg = _result!;
    final statusInfo = AppConfig.packageStatuses[pkg.status];
    final statusColor = Color(statusInfo?.colorValue ?? 0xFF9CA3AF);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(pkg.displayTracking, style: Theme.of(context).textTheme.titleLarge)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                child: Text(statusInfo?.label ?? pkg.status, style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ]),
            if (pkg.description != null) ...[
              const SizedBox(height: 8),
              Text(pkg.description!, style: Theme.of(context).textTheme.bodyMedium),
            ],
            const SizedBox(height: 16),

            // Route
            Row(children: [
              Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text('${pkg.origin?.city ?? 'N/A'}, ${pkg.origin?.country ?? ''}', style: Theme.of(context).textTheme.bodySmall),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(LucideIcons.arrowRight, size: 14, color: AppColors.textMuted)),
              Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text('${pkg.destination?.city ?? 'N/A'}, ${pkg.destination?.country ?? ''}', style: Theme.of(context).textTheme.bodySmall),
            ]),

            // History
            if (pkg.history != null && pkg.history!.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),
              Text('Historique', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ...pkg.history!.take(5).map((h) {
                final si = AppConfig.packageStatuses[h.status];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(children: [
                    Container(width: 6, height: 6, decoration: BoxDecoration(color: Color(si?.colorValue ?? 0xFF9CA3AF), shape: BoxShape.circle)),
                    const SizedBox(width: 10),
                    Expanded(child: Text(si?.label ?? h.status, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
                    if (h.createdAt != null) Text(_formatDate(h.createdAt!), style: Theme.of(context).textTheme.bodySmall),
                  ]),
                );
              }),
            ],

            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => context.push('/packages/${pkg.id}'),
                child: const Text('Voir les détails'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotFound() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(children: [
          const Icon(LucideIcons.package2, size: 48, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text('Colis introuvable', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(_error ?? 'Vérifiez le numéro de suivi et réessayez', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
        ]),
      ),
    );
  }

  Widget _buildHelpSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Comment ça marche ?', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            _helpStep('1', 'Entrez votre numéro', 'Saisissez le numéro de suivi fourni lors de l\'enregistrement'),
            _helpStep('2', 'Consultez le statut', 'Visualisez en temps réel où se trouve votre colis'),
            _helpStep('3', 'Recevez les alertes', 'Activez les notifications pour être informé à chaque étape'),
          ],
        ),
      ),
    );
  }

  Widget _helpStep(String num, String title, String desc) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(color: AppColors.primaryBg, borderRadius: BorderRadius.circular(8)),
            child: Center(child: Text(num, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13))),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            Text(desc, style: Theme.of(context).textTheme.bodySmall),
          ])),
        ],
      ),
    );
  }

  Widget _buildStatusLegend() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Les étapes de livraison', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            ...AppConfig.packageStatuses.entries.map((e) {
              final color = Color(e.value.colorValue);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                    child: Text(e.value.label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
                  ),
                ]),
              );
            }),
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
