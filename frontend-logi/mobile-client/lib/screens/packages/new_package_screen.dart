import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../config/tenant_features.dart';
import '../../services/api_service.dart';

class NewPackageScreen extends StatefulWidget {
  const NewPackageScreen({super.key});

  @override
  State<NewPackageScreen> createState() => _NewPackageScreenState();
}

class _NewPackageScreenState extends State<NewPackageScreen> {
  final _formKey = GlobalKey<FormState>();
  final _supplierTrackingCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _quantityCtrl = TextEditingController(text: '1');
  final _weightCtrl = TextEditingController();
  final _cbmCtrl = TextEditingController();
  final _declaredValueCtrl = TextEditingController();
  final _recipientNameCtrl = TextEditingController();
  final _recipientPhoneCtrl = TextEditingController();

  String? _originCountry;
  String? _originCity;
  String? _destCountry;
  String? _destWarehouse;
  String? _transportMode;
  String? _packageType;
  String _currency = 'USD';
  bool _loading = false;

  // Edit mode
  bool _editMode = false;
  String? _editPackageId;

  // Shortcut to the singleton
  final _tc = TenantConfig.instance;

  // Departure info
  Map<String, dynamic>? _nextDeparture;
  bool _departureLoading = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Check for edit mode from query params
    final uri = GoRouterState.of(context).uri;
    final editId = uri.queryParameters['edit'];
    if (editId != null && editId.isNotEmpty && !_editMode) {
      _editMode = true;
      _editPackageId = editId;
      _loadPackageForEdit(editId);
    }
    // Check for template data passed via extra
    final extra = GoRouterState.of(context).extra;
    if (extra is Map<String, dynamic> && _recipientNameCtrl.text.isEmpty) {
      _prefillFromTemplate(extra);
    }
  }

  @override
  void dispose() {
    _supplierTrackingCtrl.dispose();
    _descriptionCtrl.dispose();
    _quantityCtrl.dispose();
    _weightCtrl.dispose();
    _cbmCtrl.dispose();
    _declaredValueCtrl.dispose();
    _recipientNameCtrl.dispose();
    _recipientPhoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPackageForEdit(String packageId) async {
    try {
      final api = context.read<ApiService>();
      final data = await api.getPackageById(packageId);
      final pkg = data['package'] ?? data;
      if (mounted) {
        setState(() {
          _supplierTrackingCtrl.text = pkg['supplier_tracking'] ?? '';
          _descriptionCtrl.text = pkg['description'] ?? '';
          _quantityCtrl.text = (pkg['quantity'] ?? 1).toString();
          if (pkg['weight'] != null) _weightCtrl.text = pkg['weight'].toString();
          if (pkg['cbm'] != null) _cbmCtrl.text = pkg['cbm'].toString();
          if (pkg['declared_value'] != null) _declaredValueCtrl.text = pkg['declared_value'].toString();
          _currency = pkg['currency'] ?? 'USD';
          _originCountry = pkg['origin']?['country'] ?? pkg['origin_country'];
          _originCity = pkg['origin']?['city'] ?? pkg['origin_city'];
          _destCountry = pkg['destination']?['country'] ?? pkg['destination_country'];
          _destWarehouse = pkg['destination']?['warehouse'] ?? pkg['destination_warehouse'];
          _transportMode = pkg['transport_mode'];
          _packageType = pkg['package_type'];
          _recipientNameCtrl.text = pkg['recipient']?['name'] ?? pkg['recipient_name'] ?? '';
          _recipientPhoneCtrl.text = pkg['recipient']?['phone'] ?? pkg['recipient_phone'] ?? '';
        });
        _loadDepartureInfo();
      }
    } catch (_) {}
  }

  void _prefillFromTemplate(Map<String, dynamic> tpl) {
    setState(() {
      _recipientNameCtrl.text = tpl['recipient_name'] ?? '';
      _recipientPhoneCtrl.text = tpl['recipient_phone'] ?? '';
      _destCountry = tpl['country'];
      _destWarehouse = tpl['warehouse'];
    });
  }

  // ── Dynamic data helpers (delegated to TenantConfig) ──────

  List<String> get _availableTransports {
    if (_originCountry == null || _destCountry == null) return [];
    return _tc.getAvailableTransports(_originCountry!, _destCountry!);
  }

  List<Map<String, dynamic>> _getPackageTypesFromRates() {
    if (_originCountry == null || _destCountry == null || _transportMode == null) return [];
    return _tc.getPackageTypes(_transportMode!, _originCountry!, _destCountry!);
  }

  String _transportLabel(String mode) => _tc.transportLabel(mode);

  Map<String, dynamic>? get _selectedTypeConfig {
    if (_packageType == null || _transportMode == null || _originCountry == null || _destCountry == null) return null;
    return _tc.getTypeConfig(_packageType!, _transportMode!, _originCountry!, _destCountry!);
  }

  String? get _routeCurrency {
    if (_originCountry == null || _destCountry == null || _transportMode == null) return null;
    return _tc.getRouteCurrency(_originCountry!, _destCountry!, _transportMode!);
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
      // Show rate info even without full estimate
      return {
        'rate': rate,
        'unit': unit,
        'currency': currency,
        'canEstimate': false,
      };
    }

    return {
      'estimate': estimate,
      'details': details,
      'currency': currency,
      'canEstimate': true,
    };
  }

  // ── Departure info ────────────────────────────────────────

  Future<void> _loadDepartureInfo() async {
    if (_originCountry == null || _destCountry == null || _transportMode == null) {
      setState(() => _nextDeparture = null);
      return;
    }
    setState(() => _departureLoading = true);
    try {
      final api = context.read<ApiService>();
      final data = await api.getUpcomingDepartures(
        origin: _originCountry,
        destination: _destCountry,
        transport: _transportMode,
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

  // ── Submit ────────────────────────────────────────────────

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_originCountry == null || _destCountry == null || _transportMode == null || _packageType == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Veuillez remplir tous les champs obligatoires'), backgroundColor: AppColors.error),
      );
      return;
    }
    setState(() => _loading = true);

    try {
      final api = context.read<ApiService>();

      // Resolve origin city name from city ID if needed
      String? originCityName = _originCity;
      if (_originCity != null && _originCountry != null) {
        final cities = _tc.getOriginCities(_originCountry!);
        for (final c in cities) {
          if (c['id'] == _originCity || c['name'] == _originCity) {
            originCityName = c['name']?.toString();
            break;
          }
        }
      }

      // FLAT format matching backend expectations
      final data = <String, dynamic>{
        'supplier_tracking': _supplierTrackingCtrl.text.trim(),
        'description': _descriptionCtrl.text.trim(),
        'origin_country': _originCountry,
        'origin_city': originCityName,
        'destination_country': _destCountry,
        'destination_warehouse': _destWarehouse,
        'transport_mode': _transportMode,
        'package_type': _packageType,
        'quantity': int.tryParse(_quantityCtrl.text) ?? 1,
        'currency': _currency,
        'recipient_name': _recipientNameCtrl.text.trim(),
        'recipient_phone': _recipientPhoneCtrl.text.trim(),
      };
      if (_weightCtrl.text.isNotEmpty) data['weight'] = double.tryParse(_weightCtrl.text);
      if (_cbmCtrl.text.isNotEmpty) data['cbm'] = double.tryParse(_cbmCtrl.text);
      if (_declaredValueCtrl.text.isNotEmpty) data['declared_value'] = double.tryParse(_declaredValueCtrl.text);

      if (_editMode && _editPackageId != null) {
        await api.updatePackage(_editPackageId!, data);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Colis modifié avec succès'), backgroundColor: AppColors.success),
          );
          context.go('/packages/$_editPackageId');
        }
      } else {
        final result = await api.createPackage(data);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Colis créé avec succès'), backgroundColor: AppColors.success),
          );
          final newId = result['package']?['id'];
          context.go(newId != null ? '/packages/$newId' : '/packages');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Build ─────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final packageTypes = _getPackageTypesFromRates();
    final estimateData = _calculateEstimate();

    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text(_editMode ? 'Modifier le colis' : 'Nouveau colis'),
      ),
      body: !_tc.isLoaded
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _sectionTitle('Tracking fournisseur'),
                  TextFormField(
                    controller: _supplierTrackingCtrl,
                    decoration: const InputDecoration(labelText: 'Numéro de suivi fournisseur *', hintText: 'Ex: 1688, Alibaba, Taobao...'),
                    validator: (v) => v == null || v.isEmpty ? 'Requis' : null,
                  ),
                  const SizedBox(height: 20),

                  _sectionTitle('Origine'),
                  _buildLabeledDropdown(
                    'Pays de départ *',
                    _tc.origins.entries.map((e) => _DropdownItem(e.key, (e.value as Map)['label']?.toString() ?? e.key)).toList(),
                    _originCountry,
                    (v) {
                      setState(() { _originCountry = v; _originCity = null; _transportMode = null; _packageType = null; _nextDeparture = null; });
                    },
                  ),
                  const SizedBox(height: 12),
                  if (_originCountry != null) ...[
                    _buildLabeledDropdown(
                      'Ville *',
                      _tc.getOriginCities(_originCountry!)
                          .map<_DropdownItem>((c) => _DropdownItem(c['name'].toString(), c['name'].toString()))
                          .toList(),
                      _originCity,
                      (v) => setState(() => _originCity = v),
                    ),
                    const SizedBox(height: 20),
                  ],

                  _sectionTitle('Destination'),
                  _buildLabeledDropdown(
                    'Pays de destination *',
                    _tc.destinations.entries.map((e) => _DropdownItem(e.key, (e.value as Map)['label']?.toString() ?? e.key)).toList(),
                    _destCountry,
                    (v) {
                      setState(() { _destCountry = v; _destWarehouse = null; _transportMode = null; _packageType = null; _nextDeparture = null; });
                    },
                  ),
                  const SizedBox(height: 12),
                  if (_destCountry != null) ...[
                    _buildLabeledDropdown(
                      'Point de retrait *',
                      _tc.getWarehouses(_destCountry!)
                          .map<_DropdownItem>((w) => _DropdownItem(w['name'].toString(), w['name'].toString()))
                          .toList(),
                      _destWarehouse,
                      (v) => setState(() => _destWarehouse = v),
                    ),
                    const SizedBox(height: 20),
                  ],

                  _sectionTitle('Transport et type'),
                  _buildLabeledDropdown(
                    'Moyen de transport *',
                    _availableTransports.map((t) => _DropdownItem(t, _transportLabel(t))).toList(),
                    _transportMode,
                    (v) {
                      setState(() { _transportMode = v; _packageType = null; });
                      _loadDepartureInfo();
                    },
                  ),
                  const SizedBox(height: 12),
                  if (_transportMode != null && packageTypes.isNotEmpty) ...[
                    _buildLabeledDropdown(
                      'Type de colis *',
                      packageTypes.map((t) => _DropdownItem(t['value'] as String, t['label'] as String)).toList(),
                      _packageType,
                      (v) => setState(() => _packageType = v),
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: _descriptionCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Description *', hintText: 'Décrivez le contenu de votre colis'),
                    validator: (v) => v == null || v.isEmpty ? 'Requis' : null,
                  ),
                  const SizedBox(height: 20),

                  _sectionTitle('Mesures'),
                  _buildMeasureFields(),
                  const SizedBox(height: 20),

                  // Cost estimation card
                  if (_packageType != null) ...[
                    _buildEstimateCard(estimateData),
                    const SizedBox(height: 16),
                  ],

                  // Departure info card
                  if (_transportMode != null && _originCountry != null && _destCountry != null) ...[
                    _buildDepartureCard(),
                    const SizedBox(height: 20),
                  ],

                  _sectionTitle('Valeur déclarée'),
                  Row(children: [
                    Expanded(child: TextFormField(controller: _declaredValueCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Valeur'))),
                    const SizedBox(width: 12),
                    SizedBox(
                      width: 100,
                      child: _buildLabeledDropdown(
                        'Devise',
                        _tc.currencies.map((c) => _DropdownItem(c, c)).toList(),
                        _currency,
                        (v) => setState(() => _currency = v ?? 'USD'),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 20),

                  _sectionTitle('Destinataire'),
                  Row(children: [
                    Expanded(child: TextFormField(controller: _recipientNameCtrl, decoration: const InputDecoration(labelText: 'Nom'))),
                    const SizedBox(width: 12),
                    Expanded(child: TextFormField(controller: _recipientPhoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Téléphone'))),
                  ]),
                  const SizedBox(height: 32),

                  SizedBox(
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _handleSubmit,
                      child: _loading
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(_editMode ? 'Enregistrer' : 'Créer le colis'),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }

  // ── UI helpers ────────────────────────────────────────────

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium),
    );
  }

  Widget _buildLabeledDropdown(String label, List<_DropdownItem> items, String? value, ValueChanged<String?> onChanged) {
    final validValue = items.any((i) => i.value == value) ? value : null;
    return DropdownButtonFormField<String>(
      value: validValue,
      decoration: InputDecoration(labelText: label),
      isExpanded: true,
      items: items.map((e) => DropdownMenuItem(value: e.value, child: Text(e.label, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: onChanged,
    );
  }

  /// Show only the measure fields relevant to the selected package type's unit
  Widget _buildMeasureFields() {
    final typeConfig = _selectedTypeConfig;
    final unit = typeConfig?['unit'] as String? ?? 'kg';

    if (_packageType == null) {
      return Column(children: [
        Row(children: [
          Expanded(child: TextFormField(controller: _quantityCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantité'))),
          const SizedBox(width: 12),
          Expanded(child: TextFormField(controller: _weightCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Poids (kg)'), onChanged: (_) => setState(() {}))),
        ]),
        const SizedBox(height: 12),
        TextFormField(controller: _cbmCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Volume (m³)'), onChanged: (_) => setState(() {})),
      ]);
    }

    final fields = <Widget>[];
    if (unit == 'kg') {
      fields.add(TextFormField(controller: _weightCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Poids (kg) *'), onChanged: (_) => setState(() {})));
    } else if (unit == 'cbm') {
      fields.add(TextFormField(controller: _cbmCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Volume (m³) *'), onChanged: (_) => setState(() {})));
      fields.add(const SizedBox(height: 12));
      fields.add(TextFormField(controller: _weightCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Poids (kg) - optionnel'), onChanged: (_) => setState(() {})));
    } else if (unit == 'piece') {
      fields.add(TextFormField(controller: _quantityCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantité *'), onChanged: (_) => setState(() {})));
    } else if (unit == 'fixed') {
      fields.add(Text('Tarif fixe — aucune mesure requise', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted)));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: fields);
  }

  Widget _buildEstimateCard(Map<String, dynamic>? data) {
    if (data == null) {
      return const SizedBox.shrink();
    }

    final canEstimate = data['canEstimate'] == true;
    final currency = data['currency'] ?? 'USD';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: canEstimate ? AppColors.primaryBg : AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: canEstimate ? AppColors.primary.withValues(alpha: 0.3) : AppColors.border),
      ),
      child: canEstimate
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text('Coût estimé', style: Theme.of(context).textTheme.bodySmall),
                Text('${(data['estimate'] as double).toStringAsFixed(2)} $currency',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(color: AppColors.primary, fontWeight: FontWeight.bold)),
              ]),
              const SizedBox(height: 8),
              Text(data['details'] as String, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
              const SizedBox(height: 4),
              Text('* Estimation indicative, le coût final sera calculé à la réception',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted, fontSize: 11)),
            ])
          : Row(children: [
              const Icon(LucideIcons.info, size: 16, color: AppColors.textMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Tarif: ${data['rate']} $currency${_unitSuffix(data['unit'] as String? ?? 'kg')} — renseignez les mesures pour voir l\'estimation',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
                ),
              ),
            ]),
    );
  }

  String _unitSuffix(String unit) {
    switch (unit) {
      case 'kg': return '/kg';
      case 'cbm': return '/m³';
      case 'piece': return '/pièce';
      case 'fixed': return '';
      default: return '/$unit';
    }
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
          Expanded(
            child: Text(
              'Aucun départ programmé pour cette route. Votre colis sera assigné au prochain départ disponible.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
            ),
          ),
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
}

class _DropdownItem {
  final String value;
  final String label;
  const _DropdownItem(this.value, this.label);
}
