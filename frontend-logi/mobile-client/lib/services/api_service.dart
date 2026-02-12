import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class ApiService {
  static String get _appChannel {
    if (kIsWeb) return 'web_client';
    return defaultTargetPlatform == TargetPlatform.iOS
        ? 'app_ios_client'
        : 'app_android_client';
  }

  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String? _accessToken;
  String? _refreshToken;
  String? _csrfToken;
  bool _isRefreshing = false;

  VoidCallback? onUnauthorized;

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiUrl,
      connectTimeout: AppConfig.apiTimeout,
      receiveTimeout: AppConfig.apiTimeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': AppConfig.tenantId,
        'X-App-Type': 'client',
        'X-App-Channel': _appChannel,
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: _onRequest,
      onError: _onError,
    ));
  }

  // ── Token management ──────────────────────────────────────

  Future<void> loadTokens() async {
    _accessToken = await _storage.read(key: 'access_token');
    _refreshToken = await _storage.read(key: 'refresh_token');
    _csrfToken = await _storage.read(key: 'csrf_token');
  }

  Future<void> saveTokens({String? access, String? refresh, String? csrf}) async {
    if (access != null) {
      _accessToken = access;
      await _storage.write(key: 'access_token', value: access);
    }
    if (refresh != null) {
      _refreshToken = refresh;
      await _storage.write(key: 'refresh_token', value: refresh);
    }
    if (csrf != null) {
      _csrfToken = csrf;
      await _storage.write(key: 'csrf_token', value: csrf);
    }
  }

  Future<void> clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    _csrfToken = null;
    await _storage.deleteAll();
  }

  bool get isAuthenticated => _accessToken != null && _accessToken!.isNotEmpty;

  // ── Interceptors ──────────────────────────────────────────

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (_accessToken != null) {
      options.headers['Authorization'] = 'Bearer $_accessToken';
    }
    final method = options.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].contains(method) && _csrfToken != null) {
      options.headers['X-CSRF-Token'] = _csrfToken;
    }
    handler.next(options);
  }

  Future<void> _onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && _refreshToken != null && !_isRefreshing) {
      _isRefreshing = true;
      try {
        final refreshed = await _tryRefresh();
        if (refreshed) {
          _isRefreshing = false;
          // Retry original request
          final opts = err.requestOptions;
          opts.headers['Authorization'] = 'Bearer $_accessToken';
          if (_csrfToken != null) opts.headers['X-CSRF-Token'] = _csrfToken;
          final response = await _dio.fetch(opts);
          return handler.resolve(response);
        }
      } catch (_) {}
      _isRefreshing = false;
      onUnauthorized?.call();
    }
    handler.next(err);
  }

  Future<bool> _tryRefresh() async {
    try {
      final response = await Dio(BaseOptions(
        baseUrl: AppConfig.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_refreshToken',
          'X-App-Channel': _appChannel,
          'X-Tenant-ID': AppConfig.tenantId,
        },
      )).post('/auth/refresh');

      final data = response.data;
      await saveTokens(
        access: data['access_token'],
        csrf: data['csrf_token'],
      );
      return true;
    } catch (e) {
      debugPrint('[API] Refresh failed: $e');
      return false;
    }
  }

  // ── HTTP methods ──────────────────────────────────────────

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? queryParameters}) async {
    final response = await _dio.get(path, queryParameters: queryParameters);
    return _extractData(response);
  }

  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    final response = await _dio.post(path, data: data);
    return _extractData(response);
  }

  Future<Map<String, dynamic>> put(String path, {dynamic data}) async {
    final response = await _dio.put(path, data: data);
    return _extractData(response);
  }

  Future<Map<String, dynamic>> delete(String path, {dynamic data}) async {
    final response = await _dio.delete(path, data: data);
    return _extractData(response);
  }

  Map<String, dynamic> _extractData(Response response) {
    if (response.data is Map<String, dynamic>) return response.data;
    return {'data': response.data};
  }

  // ── Auth endpoints ────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await post('/auth/login', data: {'email': email, 'password': password});
    await saveTokens(
      access: data['access_token'],
      refresh: data['refresh_token'],
      csrf: data['csrf_token'],
    );
    return data;
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    String? phone,
  }) async {
    final data = await post('/auth/register', data: {
      'email': email,
      'password': password,
      'first_name': firstName,
      'last_name': lastName,
      if (phone != null) 'phone': phone,
    });
    await saveTokens(
      access: data['access_token'],
      refresh: data['refresh_token'],
      csrf: data['csrf_token'],
    );
    return data;
  }

  Future<void> logout() async {
    try {
      await post('/auth/logout');
    } catch (_) {}
    await clearTokens();
  }

  Future<Map<String, dynamic>> getProfile() async {
    return get('/auth/me');
  }

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> profileData) async {
    return put('/auth/me', data: profileData);
  }

  Future<Map<String, dynamic>> changePassword(String currentPassword, String newPassword) async {
    return post('/auth/change-password', data: {
      'current_password': currentPassword,
      'new_password': newPassword,
    });
  }

  Future<Map<String, dynamic>> changePasswordVerified(String currentPassword, String newPassword, String verificationToken) async {
    return post('/auth/change-password-verified', data: {
      'current_password': currentPassword,
      'new_password': newPassword,
      'verification_token': verificationToken,
    });
  }

  Future<Map<String, dynamic>> resetPassword(String email, String password, String verificationToken) async {
    return post('/auth/reset-password', data: {
      'email': email,
      'password': password,
      'verification_token': verificationToken,
    });
  }

  Future<Map<String, dynamic>> registerVerified(Map<String, dynamic> userData) async {
    final data = await post('/auth/register-verified', data: userData);
    await saveTokens(
      access: data['access_token'],
      refresh: data['refresh_token'],
      csrf: data['csrf_token'],
    );
    return data;
  }

  // ── OTP endpoints ─────────────────────────────────────────

  Future<Map<String, dynamic>> requestOtp({required String email, required String purpose}) async {
    return post('/auth/otp/request', data: {'email': email, 'purpose': purpose});
  }

  Future<Map<String, dynamic>> verifyOtp({required String email, required String code, required String purpose}) async {
    final data = await post('/auth/otp/verify', data: {'email': email, 'code': code, 'purpose': purpose});
    if (data['access_token'] != null) {
      await saveTokens(access: data['access_token'], refresh: data['refresh_token'], csrf: data['csrf_token']);
    }
    return data;
  }

  // ── Packages endpoints ────────────────────────────────────

  Future<Map<String, dynamic>> getPackages({int page = 1, int perPage = 20, String? status, String? search}) async {
    return get('/packages', queryParameters: {
      'page': page,
      'per_page': perPage,
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
  }

  Future<Map<String, dynamic>> getPackageById(String id) async {
    return get('/packages/$id');
  }

  Future<Map<String, dynamic>> getPackageStats() async {
    return get('/packages/stats');
  }

  Future<Map<String, dynamic>> createPackage(Map<String, dynamic> data) async {
    return post('/packages', data: data);
  }

  Future<Map<String, dynamic>> updatePackage(String id, Map<String, dynamic> data) async {
    return put('/packages/$id', data: data);
  }

  Future<Map<String, dynamic>> deletePackage(String id) async {
    return delete('/packages/$id');
  }

  Future<Map<String, dynamic>> trackPackage(String trackingNumber) async {
    return get('/packages/track/$trackingNumber');
  }

  // ── Config endpoints ──────────────────────────────────────

  Future<Map<String, dynamic>> getTenantConfig() async {
    return get('/config/tenant/${AppConfig.tenantId}');
  }

  Future<Map<String, dynamic>> getAnnouncements() async {
    return get('/config/tenant/${AppConfig.tenantId}/announcements');
  }

  Future<Map<String, dynamic>> calculateShipping(Map<String, dynamic> data) async {
    return post('/config/tenant/${AppConfig.tenantId}/calculate', data: data);
  }

  Future<Map<String, dynamic>> getUpcomingDepartures({String? origin, String? destination, String? transport}) async {
    return get('/config/tenant/${AppConfig.tenantId}/departures', queryParameters: {
      if (origin != null) 'origin': origin,
      if (destination != null) 'destination': destination,
      if (transport != null) 'transport': transport,
    });
  }

  // ── Notifications endpoints ───────────────────────────────

  Future<Map<String, dynamic>> getNotifications({int page = 1, int perPage = 20, bool? unreadOnly}) async {
    return get('/notifications', queryParameters: {
      'page': page,
      'per_page': perPage,
      if (unreadOnly == true) 'unread_only': 'true',
    });
  }

  Future<Map<String, dynamic>> markNotificationRead(String id) async {
    return post('/notifications/$id/read');
  }

  Future<Map<String, dynamic>> markAllNotificationsRead() async {
    return post('/notifications/read-all');
  }

  Future<Map<String, dynamic>> deleteNotification(String id) async {
    return delete('/notifications/$id');
  }

  Future<Map<String, dynamic>> deleteAllNotifications() async {
    return delete('/notifications');
  }

  Future<Map<String, dynamic>> getUnreadNotificationCount() async {
    return get('/notifications/unread-count');
  }

  Future<Map<String, dynamic>> subscribePush(String token, String provider, {String deviceType = 'mobile'}) async {
    return post('/notifications/push/subscribe', data: {
      'token': token,
      'provider': provider,
      'device_type': deviceType,
    });
  }

  Future<Map<String, dynamic>> unsubscribePush(String token) async {
    return post('/notifications/push/unsubscribe', data: {'token': token});
  }

  // ── Templates endpoints ───────────────────────────────────

  Future<Map<String, dynamic>> getTemplates() async {
    return get('/templates');
  }

  Future<Map<String, dynamic>> getTemplateById(String id) async {
    return get('/templates/$id');
  }

  Future<Map<String, dynamic>> createTemplate(Map<String, dynamic> data) async {
    return post('/templates', data: data);
  }

  Future<Map<String, dynamic>> updateTemplate(String id, Map<String, dynamic> data) async {
    return put('/templates/$id', data: data);
  }

  Future<Map<String, dynamic>> deleteTemplate(String id) async {
    return delete('/templates/$id');
  }

  // ── Online Payments endpoints ─────────────────────────────

  Future<List<dynamic>> getPaymentProviders() async {
    final response = await _dio.get('/payments/providers');
    if (response.data is List) return response.data;
    return (response.data as Map<String, dynamic>)['data'] ?? [];
  }

  Future<Map<String, dynamic>> initiatePayment({
    required String provider,
    required List<String> packageIds,
    required String currency,
    String? returnUrl,
    String? phone,
  }) async {
    return post('/payments/initiate', data: {
      'provider': provider,
      'package_ids': packageIds,
      'currency': currency,
      if (returnUrl != null) 'return_url': returnUrl,
      if (phone != null) 'phone': phone,
    });
  }

  Future<Map<String, dynamic>> checkPaymentStatus(String paymentId) async {
    return get('/payments/$paymentId/status');
  }

  Future<Map<String, dynamic>> getPaymentHistory({int page = 1, int perPage = 20}) async {
    return get('/payments/history', queryParameters: {
      'page': page,
      'per_page': perPage,
    });
  }

  // ── Client profile & settings ──────────────────────────────

  Future<Map<String, dynamic>> getClientProfile() async {
    return get('/clients/profile');
  }

  Future<Map<String, dynamic>> updateClientProfile(Map<String, dynamic> data) async {
    return put('/clients/profile', data: data);
  }

  Future<Map<String, dynamic>> updateNotificationSettings(Map<String, dynamic> settings) async {
    return put('/clients/settings/notifications', data: settings);
  }
}
