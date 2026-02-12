class AppConfig {
  static const String appName = 'Express Cargo';
  static const String appVersion = '1.0.0';
  static const String tenantId = 'ec-tenant-001';

  // API URLs per environment
  static const String androidDevApiUrl = 'http://10.0.2.2:5000/api'; // Android emulator
  static const String webDevApiUrl = 'http://localhost:5000/api'; // Chrome / Web
  static const String prodApiUrl = 'https://api.expresscargo.com/api';

  static String get apiUrl {
    const env = String.fromEnvironment('ENV', defaultValue: 'development');
    if (env == 'production') return prodApiUrl;
    // For web (Chrome) use localhost, for mobile emulator use 10.0.2.2
    const platform = String.fromEnvironment('PLATFORM', defaultValue: 'web');
    return platform == 'android' ? androidDevApiUrl : webDevApiUrl;
  }

  // Asset paths
  static const String appLogo = 'assets/images/logo_tenant.png';
  static const String personalLogo = 'assets/images/logo_bomil.png';

  // Package statuses
  static const Map<String, PackageStatusInfo> packageStatuses = {
    'pending': PackageStatusInfo('En attente', 0xFF9CA3AF),
    'received': PackageStatusInfo('Reçu', 0xFF3B82F6),
    'in_transit': PackageStatusInfo('En transit', 0xFF1A56DB),
    'arrived_port': PackageStatusInfo('Arrivé au port', 0xFFF59E0B),
    'customs': PackageStatusInfo('Dédouanement', 0xFFF59E0B),
    'out_for_delivery': PackageStatusInfo('En livraison', 0xFF10B981),
    'delivered': PackageStatusInfo('Livré', 0xFF10B981),
  };

  // Transport modes
  static const List<TransportModeInfo> transportModes = [
    TransportModeInfo('sea', 'Bateau (Maritime)'),
    TransportModeInfo('air_normal', 'Avion - Normal'),
    TransportModeInfo('air_express', 'Avion - Express'),
  ];

  // Currencies (fallback only — prefer API-loaded currencies)
  static const List<String> currencies = ['XAF', 'XOF', 'USD'];

  // Pagination
  static const int itemsPerPage = 20;

  // Timeouts
  static const Duration apiTimeout = Duration(seconds: 30);
  static const Duration toastDuration = Duration(seconds: 4);
}

class PackageStatusInfo {
  final String label;
  final int colorValue;

  const PackageStatusInfo(this.label, this.colorValue);
}

class TransportModeInfo {
  final String value;
  final String label;

  const TransportModeInfo(this.value, this.label);
}
