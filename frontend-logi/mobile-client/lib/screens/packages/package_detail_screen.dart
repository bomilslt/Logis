import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../models/package.dart';
import '../../services/api_service.dart';
import 'payment_screen.dart';
import '../../config/tenant_features.dart';

class PackageDetailScreen extends StatefulWidget {
  final String packageId;
  const PackageDetailScreen({super.key, required this.packageId});

  @override
  State<PackageDetailScreen> createState() => _PackageDetailScreenState();
}

class _PackageDetailScreenState extends State<PackageDetailScreen> {
  Package? _package;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPackage();
  }

  Future<void> _loadPackage() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = context.read<ApiService>();
      final data = await api.getPackageById(widget.packageId);
      if (mounted) {
        setState(() {
          _package = Package.fromJson(data['package'] ?? data);
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
        leading: const BackButton(),
        title: Text(_package?.displayTracking ?? 'Détail colis'),
        actions: [
          if (_package != null && _package!.isEditable)
            IconButton(
              icon: const Icon(LucideIcons.edit, size: 20),
              onPressed: () => context.push('/new-package?edit=${widget.packageId}'),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(LucideIcons.alertCircle, size: 48, color: AppColors.error),
                    const SizedBox(height: 12),
                    Text(_error!, style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 12),
                    ElevatedButton(onPressed: _loadPackage, child: const Text('Réessayer')),
                  ]),
                )
              : RefreshIndicator(
                  onRefresh: _loadPackage,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildStatusSection(),
                      const SizedBox(height: 16),
                      _buildTrackingProgress(),
                      const SizedBox(height: 16),
                      _buildInfoSection(),
                      const SizedBox(height: 16),
                      _buildRouteSection(),
                      if (_package!.recipient != null) ...[
                        const SizedBox(height: 16),
                        _buildRecipientSection(),
                      ],
                      const SizedBox(height: 16),
                      _buildPaymentSection(),
                      if (_package!.history != null && _package!.history!.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        _buildHistorySection(),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _buildStatusSection() {
    final pkg = _package!;
    final statusInfo = AppConfig.packageStatuses[pkg.status];
    final statusColor = Color(statusInfo?.colorValue ?? 0xFF9CA3AF);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(LucideIcons.package2, color: statusColor, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(pkg.displayTracking, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                  child: Text(statusInfo?.label ?? pkg.status, style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTrackingProgress() {
    final statuses = ['pending', 'received', 'in_transit', 'arrived_port', 'customs', 'out_for_delivery', 'delivered'];
    final currentIdx = statuses.indexOf(_package!.status);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Progression', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            ...List.generate(statuses.length, (i) {
              final isActive = i <= currentIdx;
              final isCurrent = i == currentIdx;
              final statusInfo = AppConfig.packageStatuses[statuses[i]];
              final color = isActive ? Color(statusInfo?.colorValue ?? 0xFF3B82F6) : AppColors.textMuted;

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(children: [
                    Container(
                      width: 24, height: 24,
                      decoration: BoxDecoration(
                        color: isActive ? color : Colors.transparent,
                        border: Border.all(color: color, width: 2),
                        shape: BoxShape.circle,
                      ),
                      child: isActive ? const Icon(LucideIcons.check, size: 14, color: Colors.white) : null,
                    ),
                    if (i < statuses.length - 1)
                      Container(width: 2, height: 28, color: isActive ? color.withValues(alpha: 0.3) : AppColors.border),
                  ]),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(
                        statusInfo?.label ?? statuses[i],
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: isCurrent ? FontWeight.w600 : FontWeight.w400,
                          color: isActive ? AppColors.textPrimary : AppColors.textMuted,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoSection() {
    final pkg = _package!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Informations', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            if (pkg.description != null) _infoRow('Description', pkg.description!),
            if (pkg.transportMode != null) _infoRow('Transport', _transportLabel(pkg.transportMode!)),
            if (pkg.packageType != null) _infoRow('Type', pkg.packageType!),
            if (pkg.weight != null) _infoRow('Poids', '${pkg.weight} kg'),
            if (pkg.cbm != null) _infoRow('Volume', '${pkg.cbm} m³'),
            if (pkg.quantity != null) _infoRow('Quantité', '${pkg.quantity}'),
            if (pkg.amount != null) _infoRow('Montant', '${pkg.amount!.toStringAsFixed(0)} ${pkg.currency ?? 'XAF'}'),
            if (pkg.declaredValue != null) _infoRow('Valeur déclarée', '${pkg.declaredValue} ${pkg.currency ?? 'USD'}'),
          ],
        ),
      ),
    );
  }

  Widget _buildRouteSection() {
    final pkg = _package!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Itinéraire', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            Row(children: [
              Container(width: 10, height: 10, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
              const SizedBox(width: 10),
              Text('${pkg.origin?.city ?? 'N/A'}, ${pkg.origin?.country ?? ''}', style: Theme.of(context).textTheme.bodyMedium),
            ]),
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Container(width: 2, height: 24, color: AppColors.border),
            ),
            Row(children: [
              Container(width: 10, height: 10, decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
              const SizedBox(width: 10),
              Text('${pkg.destination?.city ?? 'N/A'}, ${pkg.destination?.country ?? ''}', style: Theme.of(context).textTheme.bodyMedium),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _buildRecipientSection() {
    final r = _package!.recipient!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Destinataire', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            if (r.name != null) _infoRow('Nom', r.name!),
            if (r.phone != null) _infoRow('Téléphone', r.phone!),
          ],
        ),
      ),
    );
  }

  Widget _buildHistorySection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Historique', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            ..._package!.history!.map((h) {
              final statusInfo = AppConfig.packageStatuses[h.status];
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 8, height: 8, margin: const EdgeInsets.only(top: 5),
                      decoration: BoxDecoration(color: Color(statusInfo?.colorValue ?? 0xFF9CA3AF), shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(statusInfo?.label ?? h.status, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        if (h.createdAt != null)
                          Text(_formatDateTime(h.createdAt!), style: Theme.of(context).textTheme.bodySmall),
                      ]),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
          Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium)),
        ],
      ),
    );
  }

  Widget _buildPaymentSection() {
    final pkg = _package!;
    if (pkg.amount == null || pkg.amount == 0) return const SizedBox.shrink();

    final paid = pkg.paidAmount ?? 0;
    final remaining = pkg.amount! - paid;
    final currency = pkg.currency ?? 'XAF';
    final isPaid = remaining <= 0;

    String formatAmt(double v) {
      return '${v.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ')} $currency';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Paiement', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Montant total', style: TextStyle(fontSize: 13)),
                Text(formatAmt(pkg.amount!), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Payé', style: TextStyle(fontSize: 13)),
                Text(formatAmt(paid), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.success)),
              ],
            ),
            if (!isPaid) ...[
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Reste à payer', style: TextStyle(fontSize: 13)),
                  Text(formatAmt(remaining), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.error)),
                ],
              ),
              if (TenantFeatures.instance.onlinePayments) ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => PaymentSheet.show(context, pkg, onComplete: _loadPackage),
                    icon: const Icon(LucideIcons.creditCard, size: 18),
                    label: Text('Payer ${formatAmt(remaining)}'),
                  ),
                ),
              ],
            ] else ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.successBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(children: [
                  Icon(LucideIcons.checkCircle2, size: 16, color: AppColors.success),
                  SizedBox(width: 8),
                  Text('Entièrement payé', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w600, fontSize: 13)),
                ]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _transportLabel(String mode) {
    for (final t in AppConfig.transportModes) {
      if (t.value == mode) return t.label;
    }
    return mode;
  }

  String _formatDateTime(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
