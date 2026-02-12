class Package {
  final String id;
  final String? trackingNumber;
  final String? supplierTracking;
  final String? description;
  final String status;
  final String? transportMode;
  final String? packageType;
  final int? quantity;
  final double? weight;
  final double? cbm;
  final double? declaredValue;
  final String? currency;
  final double? amount;
  final double? paidAmount;
  final PackageLocation? origin;
  final PackageLocation? destination;
  final PackageRecipient? recipient;
  final List<String>? photos;
  final List<PackageHistory>? history;
  final String? estimatedDelivery;
  final bool isEditable;
  final String? createdAt;
  final String? updatedAt;

  Package({
    required this.id,
    this.trackingNumber,
    this.supplierTracking,
    this.description,
    required this.status,
    this.transportMode,
    this.packageType,
    this.quantity,
    this.weight,
    this.cbm,
    this.declaredValue,
    this.currency,
    this.amount,
    this.paidAmount,
    this.origin,
    this.destination,
    this.recipient,
    this.photos,
    this.history,
    this.estimatedDelivery,
    this.isEditable = true,
    this.createdAt,
    this.updatedAt,
  });

  String get displayTracking => supplierTracking ?? trackingNumber ?? '—';

  String get paymentStatus {
    if (amount == null || amount == 0) return 'none';
    if ((paidAmount ?? 0) >= amount!) return 'paid';
    if ((paidAmount ?? 0) > 0) return 'partial';
    return 'unpaid';
  }

  factory Package.fromJson(Map<String, dynamic> json) {
    return Package(
      id: json['id'] ?? '',
      trackingNumber: json['tracking_number'],
      supplierTracking: json['supplier_tracking'],
      description: json['description'],
      status: json['status'] ?? 'pending',
      transportMode: json['transport_mode'],
      packageType: json['package_type'],
      quantity: json['quantity'],
      weight: _toDouble(json['weight']),
      cbm: _toDouble(json['cbm']),
      declaredValue: _toDouble(json['declared_value']),
      currency: json['currency'],
      amount: _toDouble(json['amount']),
      paidAmount: _toDouble(json['paid_amount']),
      origin: json['origin'] != null ? PackageLocation.fromJson(json['origin']) : null,
      destination: json['destination'] != null ? PackageLocation.fromJson(json['destination']) : null,
      recipient: json['recipient'] != null ? PackageRecipient.fromJson(json['recipient']) : null,
      photos: json['photos'] != null ? List<String>.from(json['photos']) : null,
      history: json['history'] != null
          ? (json['history'] as List).map((h) => PackageHistory.fromJson(h)).toList()
          : null,
      estimatedDelivery: json['estimated_delivery'],
      isEditable: json['is_editable'] ?? true,
      createdAt: json['created_at'],
      updatedAt: json['updated_at'],
    );
  }

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }
}

class PackageLocation {
  final String? country;
  final String? city;
  final String? warehouse;

  PackageLocation({this.country, this.city, this.warehouse});

  factory PackageLocation.fromJson(Map<String, dynamic> json) {
    return PackageLocation(
      country: json['country'],
      city: json['city'],
      warehouse: json['warehouse'] ?? json['warehouse_id'],
    );
  }

  Map<String, dynamic> toJson() => {
    'country': country,
    'city': city,
    'warehouse': warehouse,
  };
}

class PackageRecipient {
  final String? name;
  final String? phone;

  PackageRecipient({this.name, this.phone});

  factory PackageRecipient.fromJson(Map<String, dynamic> json) {
    return PackageRecipient(name: json['name'], phone: json['phone']);
  }

  Map<String, dynamic> toJson() => {'name': name, 'phone': phone};
}

class PackageHistory {
  final String status;
  final String? note;
  final String? createdAt;

  PackageHistory({required this.status, this.note, this.createdAt});

  factory PackageHistory.fromJson(Map<String, dynamic> json) {
    return PackageHistory(
      status: json['status'] ?? '',
      note: json['note'],
      createdAt: json['created_at'],
    );
  }
}

class PackageStats {
  final int total;
  final int pending;
  final int received;
  final int inTransit;
  final int delivered;

  PackageStats({
    this.total = 0,
    this.pending = 0,
    this.received = 0,
    this.inTransit = 0,
    this.delivered = 0,
  });

  factory PackageStats.fromJson(Map<String, dynamic> json) {
    return PackageStats(
      total: json['total'] ?? 0,
      pending: json['pending'] ?? 0,
      received: json['received'] ?? 0,
      inTransit: json['in_transit'] ?? 0,
      delivered: json['delivered'] ?? 0,
    );
  }
}
