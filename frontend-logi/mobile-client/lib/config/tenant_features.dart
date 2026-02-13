/// Singleton cache for tenant configuration loaded from the API.
/// Call [TenantConfig.load] once at startup; then read data anywhere.
///
/// Mirrors the client-web's CONFIG + ShippingService pattern:
/// - origins, destinations, shipping_rates, currencies from /config/tenant
/// - Helper methods to extract available transports and package types
///   dynamically from shipping_rates (no hardcoded lists).
import '../services/api_service.dart';

class TenantConfig {
  TenantConfig._();
  static final TenantConfig _instance = TenantConfig._();
  static TenantConfig get instance => _instance;

  // ── Feature flags ──────────────────────────────────────────
  bool onlinePayments = false;

  // ── Dynamic config data ────────────────────────────────────
  Map<String, dynamic> origins = {};
  Map<String, dynamic> destinations = {};
  Map<String, dynamic> shippingRates = {};
  List<String> currencies = ['XAF', 'XOF', 'USD'];
  String defaultCurrency = 'XAF';

  bool _loaded = false;
  bool get isLoaded => _loaded;

  /// Loads all config from the /config/tenant endpoint.
  /// Safe to call multiple times; silently ignores errors.
  Future<void> load(ApiService api) async {
    try {
      final data = await api.getTenantConfig();

      // Features
      final features = data['features'] as Map<String, dynamic>? ?? {};
      onlinePayments = features['online_payments'] == true;

      // Config data
      origins = (data['origins'] as Map<String, dynamic>?) ?? {};
      destinations = (data['destinations'] as Map<String, dynamic>?) ?? {};
      shippingRates = (data['shipping_rates'] as Map<String, dynamic>?) ?? {};

      final apiCurrencies = data['currencies'];
      if (apiCurrencies is List && apiCurrencies.isNotEmpty) {
        currencies = apiCurrencies.cast<String>();
      }
      defaultCurrency = (data['default_currency'] as String?) ?? 'XAF';

      _loaded = true;
    } catch (_) {
      // keep defaults
    }
  }

  // ── Transport helpers ──────────────────────────────────────

  /// Transport mode labels (fallback for old-format rates without labels)
  static const Map<String, String> _transportLabels = {
    'sea': 'Bateau (Maritime)',
    'air_normal': 'Avion - Normal',
    'air_express': 'Avion - Express',
    'road': 'Routier',
  };

  /// Get human-readable label for a transport mode key
  String transportLabel(String mode) => _transportLabels[mode] ?? mode;

  /// Get available transport modes for a given route (origin → destination).
  /// Returns only transports that have rates configured by the admin.
  List<String> getAvailableTransports(String originCountry, String destCountry) {
    final routeKey = '${originCountry}_$destCountry';
    final rates = shippingRates[routeKey];
    if (rates == null || rates is! Map) return [];
    return (rates as Map<String, dynamic>)
        .keys
        .where((k) => k != 'currency')
        .toList();
  }

  // ── Package type helpers ───────────────────────────────────

  /// Extract package types dynamically from shipping_rates for a route+transport.
  /// Supports both new format ({label, rate, unit}) and old format (number).
  List<Map<String, dynamic>> getPackageTypes(
    String transport,
    String originCountry,
    String destCountry,
  ) {
    final routeKey = '${originCountry}_$destCountry';
    final routeRates = shippingRates[routeKey];
    if (routeRates == null || routeRates is! Map) return [];
    final transportRates = routeRates[transport];
    if (transportRates == null || transportRates is! Map) return [];

    final types = <Map<String, dynamic>>[];
    (transportRates as Map<String, dynamic>).forEach((key, value) {
      if (key == 'currency') return;
      if (value is Map) {
        // New format: { label, rate, unit }
        types.add({
          'value': key,
          'label': value['label'] ?? key,
          'unit': value['unit'] ?? 'kg',
          'rate': (value['rate'] as num?)?.toDouble() ?? 0,
        });
      } else if (value is num) {
        // Old format: number (rate only)
        types.add({
          'value': key,
          'label': _staticTypeLabel(key, transport),
          'unit': _staticTypeUnit(key, transport),
          'rate': value.toDouble(),
        });
      }
    });
    return types;
  }

  /// Get the config for a specific package type on a route+transport
  Map<String, dynamic>? getTypeConfig(
    String type,
    String transport,
    String originCountry,
    String destCountry,
  ) {
    final types = getPackageTypes(transport, originCountry, destCountry);
    for (final t in types) {
      if (t['value'] == type) return t;
    }
    return null;
  }

  /// Get the label for a package type
  String typeLabel(String type, String transport, String originCountry, String destCountry) {
    return getTypeConfig(type, transport, originCountry, destCountry)?['label'] ?? type;
  }

  /// Get the route currency for a given route+transport
  String? getRouteCurrency(String originCountry, String destCountry, String transport) {
    final routeKey = '${originCountry}_$destCountry';
    final routeRates = shippingRates[routeKey];
    if (routeRates == null || routeRates is! Map) return null;
    final transportRates = routeRates[transport];
    if (transportRates is Map) return transportRates['currency']?.toString();
    return (routeRates as Map)['currency']?.toString();
  }

  // ── Origin / Destination helpers ───────────────────────────

  String originLabel(String country) => (origins[country] as Map?)?['label'] ?? country;
  String destLabel(String country) => (destinations[country] as Map?)?['label'] ?? country;

  List<Map<String, dynamic>> getOriginCities(String country) {
    final data = origins[country];
    if (data is Map && data['cities'] is List) {
      return (data['cities'] as List).cast<Map<String, dynamic>>();
    }
    return [];
  }

  List<Map<String, dynamic>> getWarehouses(String country) {
    final data = destinations[country];
    if (data is Map && data['warehouses'] is List) {
      return (data['warehouses'] as List).cast<Map<String, dynamic>>();
    }
    return [];
  }

  // ── Static fallback labels (old rate format) ───────────────

  static String _staticTypeLabel(String type, String transport) {
    const labels = {
      'container': 'Conteneur', 'baco': 'Baco', 'carton': 'Carton',
      'vehicle': 'Véhicule', 'other_sea': 'Autre (au m³)',
      'normal': 'Normal', 'risky': 'Risqué (batterie, liquide)',
      'phone_boxed': 'Téléphone avec carton', 'phone_unboxed': 'Téléphone sans carton',
      'laptop': 'Ordinateur', 'tablet': 'Tablette',
    };
    return labels[type] ?? type;
  }

  static String _staticTypeUnit(String type, String transport) {
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
}

/// Backward-compatible alias
typedef TenantFeatures = TenantConfig;
