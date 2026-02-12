class User {
  final String id;
  final String tenantId;
  final String email;
  final String? phone;
  final String firstName;
  final String lastName;
  final String role;
  final bool isActive;
  final bool isVerified;
  final bool notifyEmail;
  final bool notifySms;
  final bool notifyWhatsapp;
  final bool notifyPush;
  final String? createdAt;

  User({
    required this.id,
    required this.tenantId,
    required this.email,
    this.phone,
    required this.firstName,
    required this.lastName,
    required this.role,
    this.isActive = true,
    this.isVerified = false,
    this.notifyEmail = true,
    this.notifySms = true,
    this.notifyWhatsapp = true,
    this.notifyPush = true,
    this.createdAt,
  });

  String get fullName => '$firstName $lastName';
  String get initials => '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'.toUpperCase();

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? '',
      tenantId: json['tenant_id'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'],
      firstName: json['first_name'] ?? '',
      lastName: json['last_name'] ?? '',
      role: json['role'] ?? 'client',
      isActive: json['is_active'] ?? true,
      isVerified: json['is_verified'] ?? false,
      notifyEmail: json['notify_email'] ?? true,
      notifySms: json['notify_sms'] ?? true,
      notifyWhatsapp: json['notify_whatsapp'] ?? true,
      notifyPush: json['notify_push'] ?? true,
      createdAt: json['created_at'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'tenant_id': tenantId,
    'email': email,
    'phone': phone,
    'first_name': firstName,
    'last_name': lastName,
    'role': role,
    'is_active': isActive,
    'is_verified': isVerified,
    'notify_email': notifyEmail,
    'notify_sms': notifySms,
    'notify_whatsapp': notifyWhatsapp,
    'notify_push': notifyPush,
  };

  User copyWith({
    String? firstName,
    String? lastName,
    String? phone,
    String? email,
    bool? notifyEmail,
    bool? notifySms,
    bool? notifyWhatsapp,
    bool? notifyPush,
  }) {
    return User(
      id: id,
      tenantId: tenantId,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      role: role,
      isActive: isActive,
      isVerified: isVerified,
      notifyEmail: notifyEmail ?? this.notifyEmail,
      notifySms: notifySms ?? this.notifySms,
      notifyWhatsapp: notifyWhatsapp ?? this.notifyWhatsapp,
      notifyPush: notifyPush ?? this.notifyPush,
      createdAt: createdAt,
    );
  }
}
