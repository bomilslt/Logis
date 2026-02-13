/// Singleton cache for tenant feature flags fetched from the API.
/// Call [TenantFeatures.load] once at startup; then read flags anywhere.
import '../services/api_service.dart';

class TenantFeatures {
  TenantFeatures._();
  static final TenantFeatures _instance = TenantFeatures._();
  static TenantFeatures get instance => _instance;

  bool onlinePayments = false;

  /// Loads features from the /config/tenant endpoint.
  /// Safe to call multiple times; silently ignores errors.
  Future<void> load(ApiService api) async {
    try {
      final data = await api.getTenantConfig();
      final features = data['features'] as Map<String, dynamic>? ?? {};
      onlinePayments = features['online_payments'] == true;
    } catch (_) {
      // keep defaults
    }
  }
}
