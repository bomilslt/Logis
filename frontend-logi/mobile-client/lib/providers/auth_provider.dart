import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService api;

  User? _user;
  bool _isLoading = true;
  bool _isInitialized = false;

  AuthProvider({required this.api}) {
    api.onUnauthorized = _handleUnauthorized;
  }

  User? get user => _user;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _user != null && api.isAuthenticated;
  bool get isInitialized => _isInitialized;

  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    await api.loadTokens();

    // Restore cached user
    final prefs = await SharedPreferences.getInstance();
    final userJson = prefs.getString('cached_user');
    if (userJson != null && api.isAuthenticated) {
      try {
        _user = User.fromJson(jsonDecode(userJson));
      } catch (_) {}
    }

    _isInitialized = true;
    _isLoading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final data = await api.login(email, password);
    _setUserFromResponse(data);
  }

  Future<void> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    String? phone,
  }) async {
    final data = await api.register(
      email: email,
      password: password,
      firstName: firstName,
      lastName: lastName,
      phone: phone,
    );
    _setUserFromResponse(data);
  }

  Future<void> loginWithOtp(Map<String, dynamic> data) async {
    _setUserFromResponse(data);
  }

  Future<void> logout() async {
    await api.logout();
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('cached_user');
    notifyListeners();
  }

  Future<void> updateProfile(Map<String, dynamic> profileData) async {
    final data = await api.updateProfile(profileData);
    if (data['user'] != null) {
      _user = User.fromJson(data['user']);
      await _cacheUser();
      notifyListeners();
    }
  }

  Future<void> updateNotificationSettings(Map<String, dynamic> settings) async {
    await api.updateNotificationSettings(settings);
    if (_user != null) {
      _user = _user!.copyWith(
        notifyEmail: settings['notify_email'] ?? _user!.notifyEmail,
        notifySms: settings['notify_sms'] ?? _user!.notifySms,
        notifyPush: settings['notify_push'] ?? _user!.notifyPush,
      );
      await _cacheUser();
      notifyListeners();
    }
  }

  void _setUserFromResponse(Map<String, dynamic> data) {
    final userData = data['user'] ?? data;
    _user = User.fromJson(userData);
    _cacheUser();
    notifyListeners();
  }

  Future<void> _cacheUser() async {
    if (_user == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('cached_user', jsonEncode(_user!.toJson()));
  }

  void _handleUnauthorized() {
    _user = null;
    notifyListeners();
  }
}
