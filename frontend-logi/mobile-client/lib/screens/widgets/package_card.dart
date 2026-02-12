import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../models/package.dart';

class PackageCard extends StatelessWidget {
  final Package package;
  final VoidCallback? onTap;

  const PackageCard({super.key, required this.package, this.onTap});

  @override
  Widget build(BuildContext context) {
    final statusInfo = AppConfig.packageStatuses[package.status];
    final statusColor = Color(statusInfo?.colorValue ?? 0xFF9CA3AF);
    final statusLabel = statusInfo?.label ?? package.status;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: tracking + status badge
              Row(
                children: [
                  Expanded(
                    child: Text(
                      package.displayTracking,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              if (package.description != null && package.description!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  package.description!,
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 10),
              // Meta row
              Row(
                children: [
                  Icon(LucideIcons.mapPin, size: 14, color: AppColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    package.destination?.city ?? package.destination?.country ?? 'N/A',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
                  ),
                  const Spacer(),
                  if (package.createdAt != null) ...[
                    Icon(LucideIcons.calendar, size: 14, color: AppColors.textMuted),
                    const SizedBox(width: 4),
                    Text(
                      _formatDate(package.createdAt!),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ],
              ),
              // Payment info
              if (package.amount != null && package.amount! > 0) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(LucideIcons.dollarSign, size: 14, color: _paymentColor(package.paymentStatus)),
                    const SizedBox(width: 4),
                    Text(
                      '${_formatMoney(package.amount!)} - ${_paymentLabel(package.paymentStatus)}',
                      style: TextStyle(fontSize: 12, color: _paymentColor(package.paymentStatus), fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    } catch (_) {
      return iso;
    }
  }

  String _formatMoney(double amount) {
    final cur = package.currency ?? 'XAF';
    if (amount >= 1000000) return '${(amount / 1000000).toStringAsFixed(1)}M $cur';
    if (amount >= 1000) return '${(amount / 1000).round()}K $cur';
    return '${amount.toStringAsFixed(0)} $cur';
  }

  String _paymentLabel(String status) {
    switch (status) {
      case 'paid': return 'Payé';
      case 'partial': return 'Partiel';
      case 'unpaid': return 'À payer';
      default: return '';
    }
  }

  Color _paymentColor(String status) {
    switch (status) {
      case 'paid': return AppColors.success;
      case 'partial': return AppColors.warning;
      case 'unpaid': return AppColors.error;
      default: return AppColors.textMuted;
    }
  }
}
