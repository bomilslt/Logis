import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/theme.dart';
import '../../models/package.dart';
import '../../services/api_service.dart';

/// Bottom sheet for paying one or more packages online.
/// Shows available providers, lets user pick one, then initiates payment.
class PaymentSheet extends StatefulWidget {
  final List<Package> packages;
  final VoidCallback? onPaymentComplete;

  const PaymentSheet({
    super.key,
    required this.packages,
    this.onPaymentComplete,
  });

  /// Convenience: show the payment sheet for a single package
  static Future<void> show(BuildContext context, Package pkg, {VoidCallback? onComplete}) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PaymentSheet(packages: [pkg], onPaymentComplete: onComplete),
    );
  }

  @override
  State<PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<PaymentSheet> {
  List<dynamic> _providers = [];
  bool _loadingProviders = true;
  String? _error;

  // Payment flow state
  String? _selectedProvider;
  String? _phone;
  bool _initiating = false;
  Map<String, dynamic>? _paymentResult;
  bool _polling = false;

  double get _totalAmount {
    double total = 0;
    for (final pkg in widget.packages) {
      final remaining = (pkg.amount ?? 0) - (pkg.paidAmount ?? 0);
      if (remaining > 0) total += remaining;
    }
    return total;
  }

  String get _currency => widget.packages.first.currency ?? 'XAF';

  @override
  void initState() {
    super.initState();
    _loadProviders();
  }

  Future<void> _loadProviders() async {
    try {
      final api = context.read<ApiService>();
      final providers = await api.getPaymentProviders();
      if (mounted) {
        setState(() {
          _providers = providers;
          _loadingProviders = false;
          if (providers.isEmpty) {
            _error = 'Aucun moyen de paiement en ligne disponible.';
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingProviders = false;
          _error = 'Paiement en ligne non disponible.';
        });
      }
    }
  }

  Future<void> _initiatePayment() async {
    if (_selectedProvider == null) return;

    final provider = _providers.firstWhere(
      (p) => p['code'] == _selectedProvider,
      orElse: () => null,
    );
    if (provider == null) return;

    // MTN MoMo requires phone
    if (_selectedProvider == 'mtn_momo' && (_phone == null || _phone!.isEmpty)) {
      setState(() => _error = 'Numéro de téléphone requis pour MTN MoMo');
      return;
    }

    setState(() { _initiating = true; _error = null; });

    try {
      final api = context.read<ApiService>();
      final result = await api.initiatePayment(
        provider: _selectedProvider!,
        packageIds: widget.packages.map((p) => p.id).toList(),
        currency: _currency,
        phone: _phone,
      );

      if (mounted) {
        setState(() {
          _initiating = false;
          _paymentResult = result;
        });

        // If redirect type, open the URL
        final paymentUrl = result['payment_url'];
        if (paymentUrl != null && paymentUrl.toString().isNotEmpty) {
          final uri = Uri.parse(paymentUrl);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        }

        // If USSD push (MTN MoMo), start polling
        if (result['payment_type'] == 'ussd_push') {
          _startPolling(result['payment_id']);
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _initiating = false;
          _error = e.toString().replaceAll('Exception: ', '');
        });
      }
    }
  }

  Future<void> _startPolling(String paymentId) async {
    setState(() => _polling = true);
    final api = context.read<ApiService>();

    for (int i = 0; i < 30; i++) {
      if (!mounted || !_polling) return;
      await Future.delayed(const Duration(seconds: 3));

      try {
        final status = await api.checkPaymentStatus(paymentId);
        if (!mounted) return;

        if (status['status'] == 'confirmed') {
          setState(() => _polling = false);
          _showSuccess();
          return;
        } else if (status['status'] == 'cancelled') {
          setState(() {
            _polling = false;
            _error = 'Paiement échoué ou annulé.';
          });
          return;
        }
      } catch (_) {}
    }

    if (mounted) {
      setState(() {
        _polling = false;
        _error = 'Délai d\'attente dépassé. Vérifiez le statut plus tard.';
      });
    }
  }

  void _showSuccess() {
    widget.onPaymentComplete?.call();
    if (mounted) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Paiement confirmé !'),
          backgroundColor: AppColors.success,
        ),
      );
    }
  }

  @override
  void dispose() {
    _polling = false;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollController) {
          return Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Title
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  children: [
                    const Icon(LucideIcons.creditCard, size: 22),
                    const SizedBox(width: 10),
                    Text('Payer en ligne', style: Theme.of(context).textTheme.headlineSmall),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(LucideIcons.x, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              // Content
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  children: [
                    _buildAmountSummary(),
                    const SizedBox(height: 20),
                    if (_paymentResult != null)
                      _buildPaymentStatus()
                    else if (_loadingProviders)
                      const Center(child: Padding(
                        padding: EdgeInsets.all(32),
                        child: CircularProgressIndicator(),
                      ))
                    else ...[
                      _buildProviderSelection(),
                      if (_selectedProvider == 'mtn_momo') ...[
                        const SizedBox(height: 16),
                        _buildPhoneInput(),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.errorBg,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(children: [
                            const Icon(LucideIcons.alertCircle, size: 16, color: AppColors.error),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13))),
                          ]),
                        ),
                      ],
                      const SizedBox(height: 24),
                      _buildPayButton(),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildAmountSummary() {
    final formatter = _formatAmount;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Récapitulatif', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            ...widget.packages.map((pkg) {
              final remaining = (pkg.amount ?? 0) - (pkg.paidAmount ?? 0);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    const Icon(LucideIcons.package2, size: 16, color: AppColors.textSecondary),
                    const SizedBox(width: 8),
                    Expanded(child: Text(pkg.displayTracking, style: const TextStyle(fontSize: 13))),
                    Text(formatter(remaining), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  ],
                ),
              );
            }),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Total à payer', style: Theme.of(context).textTheme.titleMedium),
                Text(
                  formatter(_totalAmount),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(color: AppColors.primary),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatAmount(double amount) {
    final formatted = amount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]} ',
    );
    return '$formatted $_currency';
  }

  Widget _buildProviderSelection() {
    if (_providers.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const Icon(LucideIcons.creditCard, size: 40, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text(_error ?? 'Aucun moyen de paiement disponible',
                style: const TextStyle(color: AppColors.textMuted), textAlign: TextAlign.center),
          ]),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Choisir un moyen de paiement', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        ...(_providers).map((p) {
          final code = p['code'] as String;
          final name = p['name'] as String? ?? code;
          final methods = (p['methods'] as List?)?.join(', ') ?? '';
          final isSelected = _selectedProvider == code;

          return GestureDetector(
            onTap: () => setState(() { _selectedProvider = code; _error = null; }),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primaryBg : Theme.of(context).cardColor,
                border: Border.all(
                  color: isSelected ? AppColors.primary : AppColors.border,
                  width: isSelected ? 2 : 1,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.primary.withValues(alpha: 0.1) : AppColors.background,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      _providerIcon(code),
                      size: 20,
                      color: isSelected ? AppColors.primary : AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: isSelected ? AppColors.primary : AppColors.textPrimary,
                        )),
                        if (methods.isNotEmpty)
                          Text(methods, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                  if (isSelected)
                    const Icon(LucideIcons.checkCircle2, color: AppColors.primary, size: 22),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildPhoneInput() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Numéro MTN MoMo', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        TextField(
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            hintText: 'Ex: 237670000000',
            prefixIcon: Icon(LucideIcons.phone, size: 18),
          ),
          onChanged: (v) => _phone = v.trim(),
        ),
        const SizedBox(height: 4),
        const Text(
          'Entrez le numéro qui recevra la demande de paiement USSD',
          style: TextStyle(fontSize: 11, color: AppColors.textMuted),
        ),
      ],
    );
  }

  Widget _buildPayButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _selectedProvider == null || _initiating ? null : _initiatePayment,
        child: _initiating
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text('Payer ${_formatAmount(_totalAmount)}'),
      ),
    );
  }

  Widget _buildPaymentStatus() {
    final result = _paymentResult!;
    final type = result['payment_type'] ?? 'redirect';

    if (_polling) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text('En attente de confirmation...', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              result['message'] ?? 'Confirmez le paiement sur votre téléphone',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ]),
        ),
      );
    }

    if (type == 'redirect') {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            const Icon(LucideIcons.externalLink, size: 40, color: AppColors.primary),
            const SizedBox(height: 16),
            Text('Redirection vers le paiement', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text(
              'Vous avez été redirigé vers la page de paiement. Revenez ici après avoir terminé.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () async {
                final paymentId = result['payment_id'];
                if (paymentId == null) return;
                try {
                  final api = context.read<ApiService>();
                  final status = await api.checkPaymentStatus(paymentId);
                  if (status['status'] == 'confirmed') {
                    _showSuccess();
                  } else if (status['status'] == 'cancelled') {
                    setState(() => _error = 'Paiement échoué.');
                  } else {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Paiement encore en attente...')),
                      );
                    }
                  }
                } catch (_) {}
              },
              icon: const Icon(LucideIcons.refreshCw, size: 16),
              label: const Text('Vérifier le statut'),
            ),
          ]),
        ),
      );
    }

    return const SizedBox.shrink();
  }

  IconData _providerIcon(String code) {
    switch (code) {
      case 'orange_money': return LucideIcons.smartphone;
      case 'mtn_momo': return LucideIcons.smartphone;
      case 'stripe': return LucideIcons.creditCard;
      case 'flutterwave': return LucideIcons.creditCard;
      case 'cinetpay': return LucideIcons.wallet;
      case 'monetbil': return LucideIcons.wallet;
      default: return LucideIcons.creditCard;
    }
  }
}
