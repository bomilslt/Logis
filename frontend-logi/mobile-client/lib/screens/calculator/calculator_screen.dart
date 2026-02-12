import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class CalculatorScreen extends StatefulWidget {
  const CalculatorScreen({super.key});

  @override
  State<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends State<CalculatorScreen> {
  final _quantityCtrl = TextEditingController(text: '1');
  final _weightCtrl = TextEditingController();
  final _cbmCtrl = TextEditingController();

  String? _originCountry;
  String? _destCountry;
  String? _transport;
  String? _packageType;
  bool _configLoading = true;

  // Config data loaded from API — no fallback
  Map<String, dynamic> _origins = {};
  Map<String, dynamic> _destinations = {};
  Map<String, dynamic> _shippingRates = {};

  // Departure info
  Map<String, dynamic>? _nextDeparture;
  bool _departureLoading = false;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  @override
  void dispose() {
    _quantityCtrl.dispose();
    _weightCtrl.dispose();
    _cbmCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadConfig() async {
    try {
      final api = context.read<ApiService>();
      final data = await api.getTenantConfig();
      if (mounted) {
        setState(() {
          _origins = (data['origins'] as Map<String, dynamic>?) ?? {};
          _destinations = (data['destinations'] as Map<String, dynamic>?) ?? {};
          _shippingRates = (data['shipping_rates'] as Map<String, dynamic>?) ?? {};
          _configLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _configLoading = false);
    }
  }

  // ── Dynamic data helpers ──────────────────────────────────

  List<String> get _availableTransports {
    if (_originCountry == null || _destCountry == null) return [];
    final routeKey = '${_originCountry}_$_destCountry';
    final rates = _shippingRates[routeKey];
    if (rates == null || rates is! Map) return [];
    return (rates as Map<String, dynamic>).keys.where((k) => k != 'currency').toList();
  }

  /// Extract package types dynamically from shipping_rates
  List<Map<String, dynamic>> _getPackageTypesFromRates() {
    if (_originCountry == null || _destCountry == null || _transport == null) return [];
    final routeKey = '${_originCountry}_$_destCountry';
    final routeRates = _shippingRates[routeKey];
    if (routeRates == null || routeRates is! Map) return [];
    final transportRates = routeRates[_transport];
    if (transportRates == null || transportRates is! Map) return [];

    final types = <Map<String, dynamic>>[];
    (transportRates as Map<String, dynamic>).forEach((key, value) {
      if (key == 'currency') return;
      if (value is Map) {
        types.add({
          'value': key,
          'label': value['label'] ?? key,
          'unit': value['unit'] ?? 'kg',
          'rate': (value['rate'] as num?)?.toDouble() ?? 0,
        });
      } else if (value is num) {
        types.add({
          'value': key,
          'label': _staticTypeLabel(key, _transport!),
          'unit': _staticTypeUnit(key, _transport!),
          'rate': value.toDouble(),
        });
      }
    });
    return types;
  }

  String _staticTypeLabel(String type, String transport) {
    const labels = {
      'container': 'Conteneur', 'baco': 'Baco', 'carton': 'Carton',
      'vehicle': 'Véhicule', 'other_sea': 'Autre (au m³)',
      'normal': 'Normal', 'risky': 'Risqué (batterie, liquide)',
      'phone_boxed': 'Téléphone avec carton', 'phone_unboxed': 'Téléphone sans carton',
      'laptop': 'Ordinateur', 'tablet': 'Tablette',
    };
    return labels[type] ?? type;
  }

  String _staticTypeUnit(String type, String transport) {
    if (transport == 'sea') {
      const cbmTypes = {'carton', 'other_sea'};
      const fixedTypes = {'container', 'baco', 'vehicle'};
      if (cbmTypes.contains(type)) return 'cbm';
      if (fixedTypes.contains(type)) return 'fixed';
      return 'cbm';
    }
    const pieceTypes = {'phone_boxed', 'phone_unboxed', 'laptop', 'tablet'};
    if (pieceTypes.contains(type)) return 'piece';
    return 'kg';
  }

  String _transportLabel(String mode) {
    const labels = {
      'sea': 'Bateau (Maritime)',
      'air_normal': 'Avion - Normal',
      'air_express': 'Avion - Express',
      'road': 'Routier',
    };
    return labels[mode] ?? mode;
  }

  Map<String, dynamic>? get _selectedTypeConfig {
    if (_packageType == null) return null;
    final types = _getPackageTypesFromRates();
    for (final t in types) {
      if (t['value'] == _packageType) return t;
    }
    return null;
  }

  String? get _routeCurrency {
    if (_originCountry == null || _destCountry == null || _transport == null) return null;
    final routeKey = '${_originCountry}_$_destCountry';
    final routeRates = _shippingRates[routeKey];
    if (routeRates == null || routeRates is! Map) return null;
    final transportRates = routeRates[_transport];
    if (transportRates is Map) return transportRates['currency']?.toString();
    return routeRates['currency']?.toString();
  }

  // ── Cost estimation ───────────────────────────────────────

  Map<String, dynamic>? _calculateEstimate() {
    final typeConfig = _selectedTypeConfig;
    if (typeConfig == null) return null;

    final rate = (typeConfig['rate'] as num?)?.toDouble();
    if (rate == null || rate == 0) return null;

    final unit = typeConfig['unit'] as String? ?? 'kg';
    final currency = _routeCurrency ?? 'USD';
    final weight = double.tryParse(_weightCtrl.text) ?? 0;
    final cbm = double.tryParse(_cbmCtrl.text) ?? 0;
    final qty = int.tryParse(_quantityCtrl.text) ?? 0;

    double? estimate;
    String details = '';

    if (unit == 'fixed') {
      estimate = rate;
      details = 'Tarif fixe: $rate $currency';
    } else if (unit == 'cbm' && cbm > 0) {
      estimate = cbm * rate;
      details = '$cbm m³ × $rate $currency/m³';
    } else if (unit == 'piece' && qty > 0) {
      estimate = qty * rate;
      details = '$qty pièce(s) × $rate $currency/pièce';
    } else if (unit == 'kg' && weight > 0) {
      estimate = weight * rate;
      details = '$weight kg × $rate $currency/kg';
    }

    if (estimate == null) {
      return {'rate': rate, 'unit': unit, 'currency': currency, 'canEstimate': false};
    }

    return {'estimate': estimate, 'details': details, 'currency': currency, 'canEstimate': true};
  }

  // ── Departure info ────────────────────────────────────────

  Future<void> _loadDepartureInfo() async {
    if (_originCountry == null || _destCountry == null || _transport == null) {
      setState(() => _nextDeparture = null);
      return;
    }
    setState(() => _departureLoading = true);
    try {
      final api = context.read<ApiService>();
      final data = await api.getUpcomingDepartures(
        origin: _originCountry,
        destination: _destCountry,
        transport: _transport,
      );
      final departures = data['departures'] as List? ?? [];
      if (mounted) {
        setState(() {
          _nextDeparture = departures.isNotEmpty ? departures[0] as Map<String, dynamic> : null;
          _departureLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _nextDeparture = null; _departureLoading = false; });
    }
  }

  // ── Tariff grid ───────────────────────────────────────────

  List<Map<String, dynamic>> _buildTariffGrid() {
    final types = _getPackageTypesFromRates();
    if (types.isEmpty) return [];
    return types;
  }

  // ── Build ─────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final packageTypes = _getPackageTypesFromRates();
    final estimateData = _calculateEstimate();
    final tariffGrid = _buildTariffGrid();

    return Scaffold(
      appBar: AppBar(title: const Text('Calculateur de tarifs')),
      body: _configLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Estimez le coût d\'expédition de vos colis', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 16),

                _buildLabeledDropdown(
                  'Pays de départ',
                  _origins.entries.map((e) => _CalcDropdownItem(e.key, (e.value as Map)['label']?.toString() ?? e.key)).toList(),
                  _originCountry,
                  (v) { setState(() { _originCountry = v; _transport = null; _packageType = null; _nextDeparture = null; }); },
                ),
                const SizedBox(height: 12),
                _buildLabeledDropdown(
                  'Pays de destination',
                  _destinations.entries.map((e) => _CalcDropdownItem(e.key, (e.value as Map)['label']?.toString() ?? e.key)).toList(),
                  _destCountry,
                  (v) { setState(() { _destCountry = v; _transport = null; _packageType = null; _nextDeparture = null; }); },
                ),
                const SizedBox(height: 12),
                _buildLabeledDropdown(
                  'Moyen de transport',
                  _availableTransports.map((t) => _CalcDropdownItem(t, _transportLabel(t))).toList(),
                  _transport,
                  (v) {
                    setState(() { _transport = v; _packageType = null; });
                    _loadDepartureInfo();
                  },
                ),
                const SizedBox(height: 12),
                if (_transport != null && packageTypes.isNotEmpty)
                  _buildLabeledDropdown(
                    'Type de colis',
                    packageTypes.map((t) => _CalcDropdownItem(t['value'] as String, t['label'] as String)).toList(),
                    _packageType,
                    (v) => setState(() => _packageType = v),
                  ),
                const SizedBox(height: 12),

                // Measure fields based on selected type
                _buildMeasureFields(),
                const SizedBox(height: 24),

                // Result card
                _buildResultCard(estimateData),

                // Departure info
                if (_transport != null && _originCountry != null && _destCountry != null) ...[
                  const SizedBox(height: 16),
                  _buildDepartureCard(),
                ],

                // Tariff grid
                if (tariffGrid.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _buildTariffGridCard(tariffGrid),
                ],

                // Create package button
                if (estimateData != null && estimateData['canEstimate'] == true) ...[
                  const SizedBox(height: 24),
                  SizedBox(
                    height: 50,
                    child: OutlinedButton.icon(
                      onPressed: () => context.push('/new-package'),
                      icon: const Icon(LucideIcons.plus, size: 18),
                      label: const Text('Créer un colis avec ces paramètres'),
                    ),
                  ),
                ],

                const SizedBox(height: 32),
              ],
            ),
    );
  }

  // ── UI helpers ────────────────────────────────────────────

  Widget _buildLabeledDropdown(String label, List<_CalcDropdownItem> items, String? value, ValueChanged<String?> onChanged) {
    final validValue = items.any((i) => i.value == value) ? value : null;
    return DropdownButtonFormField<String>(
      value: validValue,
      decoration: InputDecoration(labelText: label),
      isExpanded: true,
      items: items.map((e) => DropdownMenuItem(value: e.value, child: Text(e.label, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: onChanged,
    );
  }

  Widget _buildMeasureFields() {
    final typeConfig = _selectedTypeConfig;
    final unit = typeConfig?['unit'] as String? ?? 'kg';

    if (_packageType == null) {
      return Column(children: [
        Row(children: [
          Expanded(child: TextField(controller: _quantityCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantité'), onChanged: (_) => setState(() {}))),
          const SizedBox(width: 12),
          Expanded(child: TextField(controller: _weightCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Poids (kg)'), onChanged: (_) => setState(() {}))),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _cbmCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Volume (m³)'), onChanged: (_) => setState(() {})),
      ]);
    }

    if (unit == 'fixed') {
      return Text('Tarif fixe — aucune mesure requise', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted));
    }
    if (unit == 'kg') {
      return TextField(controller: _weightCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Poids (kg)'), onChanged: (_) => setState(() {}));
    }
    if (unit == 'cbm') {
      return TextField(controller: _cbmCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Volume (m³)'), onChanged: (_) => setState(() {}));
    }
    if (unit == 'piece') {
      return TextField(controller: _quantityCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantité'), onChanged: (_) => setState(() {}));
    }
    return const SizedBox.shrink();
  }

  Widget _buildResultCard(Map<String, dynamic>? data) {
    if (data != null && data['canEstimate'] == true) {
      final currency = data['currency'] ?? 'USD';
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.primaryBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
        ),
        child: Column(children: [
          Text('Coût estimé', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text('${(data['estimate'] as double).toStringAsFixed(2)} $currency',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(data['details'] as String, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          Text('* Estimation indicative', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted)),
        ]),
      );
    }

    if (data != null && data['canEstimate'] == false) {
      final currency = data['currency'] ?? 'USD';
      final unit = data['unit'] as String? ?? 'kg';
      final unitLabels = {'kg': '/kg', 'cbm': '/m³', 'piece': '/pièce', 'fixed': ''};
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
        child: Row(children: [
          const Icon(LucideIcons.info, size: 16, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(child: Text(
            'Tarif: ${data['rate']} $currency${unitLabels[unit] ?? ''} — renseignez les mesures pour voir l\'estimation',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
          )),
        ]),
      );
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
      child: Column(children: [
        const Icon(LucideIcons.calculator, size: 40, color: AppColors.textMuted),
        const SizedBox(height: 8),
        Text('Estimation du coût', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text('Sélectionnez une route et un type de colis', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
      ]),
    );
  }

  Widget _buildDepartureCard() {
    if (_departureLoading) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
        child: const Row(children: [
          SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 12),
          Text('Recherche du prochain départ...'),
        ]),
      );
    }

    if (_nextDeparture == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
        child: Row(children: [
          const Icon(LucideIcons.calendar, size: 20, color: AppColors.textMuted),
          const SizedBox(width: 12),
          Expanded(child: Text(
            'Aucun départ programmé pour cette route.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
          )),
        ]),
      );
    }

    final dep = _nextDeparture!;
    final depDate = DateTime.tryParse(dep['departure_date']?.toString() ?? '');
    final arrDate = dep['estimated_arrival'] != null ? DateTime.tryParse(dep['estimated_arrival'].toString()) : null;
    final daysUntil = depDate?.difference(DateTime.now()).inDays;
    final isUrgent = daysUntil != null && daysUntil <= 3;

    String daysLabel = '';
    if (daysUntil != null) {
      if (daysUntil <= 0) {
        daysLabel = "Aujourd'hui";
      } else if (daysUntil == 1) {
        daysLabel = 'Demain';
      } else {
        daysLabel = 'Dans $daysUntil jours';
      }
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isUrgent ? AppColors.warningBg : AppColors.successBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isUrgent ? AppColors.warning.withValues(alpha: 0.3) : AppColors.success.withValues(alpha: 0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(LucideIcons.checkCircle2, size: 16, color: isUrgent ? AppColors.warning : AppColors.success),
          const SizedBox(width: 8),
          Text('Prochain départ', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: isUrgent ? AppColors.warning : AppColors.success)),
          const Spacer(),
          if (daysLabel.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: isUrgent ? AppColors.warning.withValues(alpha: 0.15) : AppColors.success.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(daysLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isUrgent ? AppColors.warning : AppColors.success)),
            ),
        ]),
        const SizedBox(height: 8),
        if (depDate != null)
          _departureRow('Départ', '${depDate.day.toString().padLeft(2, '0')}/${depDate.month.toString().padLeft(2, '0')}/${depDate.year}'),
        if (dep['estimated_duration'] != null)
          _departureRow('Durée estimée', '~${dep['estimated_duration']} jours'),
        if (arrDate != null)
          _departureRow('Arrivée estimée', '${arrDate.day.toString().padLeft(2, '0')}/${arrDate.month.toString().padLeft(2, '0')}/${arrDate.year}'),
      ]),
    );
  }

  Widget _departureRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        SizedBox(width: 120, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
      ]),
    );
  }

  Widget _buildTariffGridCard(List<Map<String, dynamic>> types) {
    final currency = _routeCurrency ?? 'USD';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Grille tarifaire', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('${_transportLabel(_transport!)} — ${_origins[_originCountry]?['label'] ?? _originCountry} → ${_destinations[_destCountry]?['label'] ?? _destCountry}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: 12),
          Table(
            columnWidths: const {0: FlexColumnWidth(2), 1: FlexColumnWidth(1), 2: FlexColumnWidth(1)},
            children: [
              TableRow(
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                children: [
                  Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Type', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12))),
                  Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Tarif', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12))),
                  Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Unité', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12))),
                ],
              ),
              ...types.map((t) {
                final unitLabels = {'kg': '/kg', 'cbm': '/m³', 'piece': '/pièce', 'fixed': 'fixe'};
                return TableRow(children: [
                  Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(t['label'] as String, style: const TextStyle(fontSize: 13))),
                  Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('${t['rate']} $currency', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
                  Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(unitLabels[t['unit']] ?? t['unit'] as String, style: TextStyle(fontSize: 12, color: AppColors.textMuted))),
                ]);
              }),
            ],
          ),
        ]),
      ),
    );
  }
}

class _CalcDropdownItem {
  final String value;
  final String label;
  const _CalcDropdownItem(this.value, this.label);
}
