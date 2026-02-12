import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final data = await api.getNotifications();
      if (mounted) {
        setState(() {
          _notifications = List<Map<String, dynamic>>.from(data['notifications'] ?? []);
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAllRead() async {
    try {
      await context.read<ApiService>().markAllNotificationsRead();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Toutes les notifications marquées comme lues'), backgroundColor: AppColors.success),
        );
      }
      _load();
    } catch (_) {}
  }

  Future<void> _deleteAll() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer toutes les notifications'),
        content: const Text('Voulez-vous vraiment supprimer toutes vos notifications ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Supprimer tout'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await context.read<ApiService>().deleteAllNotifications();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Toutes les notifications supprimées'), backgroundColor: AppColors.success),
          );
        }
        _load();
      } catch (_) {}
    }
  }

  Future<void> _deleteNotification(String id) async {
    try {
      await context.read<ApiService>().deleteNotification(id);
      setState(() {
        _notifications.removeWhere((n) => n['id'].toString() == id);
      });
    } catch (_) {}
  }

  IconData _getNotificationIcon(String? type) {
    switch (type) {
      case 'status_update': return LucideIcons.truck;
      case 'delivery': return LucideIcons.checkCircle;
      case 'payment': return LucideIcons.creditCard;
      case 'promo': return LucideIcons.tag;
      case 'system': return LucideIcons.bell;
      case 'info': return LucideIcons.info;
      default: return LucideIcons.bell;
    }
  }

  String _formatTime(String? dateString) {
    if (dateString == null) return '';
    try {
      final date = DateTime.parse(dateString);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return 'À l\'instant';
      if (diff.inMinutes < 60) return 'Il y a ${diff.inMinutes} min';
      if (diff.inHours < 24) return 'Il y a ${diff.inHours}h';
      if (diff.inDays < 7) return 'Il y a ${diff.inDays}j';
      return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => n['is_read'] != true).length;

    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Notifications'),
        actions: [
          if (unreadCount > 0)
            IconButton(
              icon: const Icon(LucideIcons.checkCheck, size: 20),
              tooltip: 'Tout marquer comme lu',
              onPressed: _markAllRead,
            ),
          if (_notifications.isNotEmpty)
            IconButton(
              icon: const Icon(LucideIcons.trash2, size: 20, color: AppColors.error),
              tooltip: 'Tout supprimer',
              onPressed: _deleteAll,
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notifications.isEmpty
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(LucideIcons.bellOff, size: 48, color: AppColors.textMuted),
                    const SizedBox(height: 12),
                    Text('Aucune notification', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text('Vous n\'avez pas de notification pour le moment', style: Theme.of(context).textTheme.bodySmall),
                  ]),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _notifications.length,
                    itemBuilder: (_, i) {
                      final n = _notifications[i];
                      final isRead = n['is_read'] == true;
                      final id = n['id'].toString();
                      final packageId = n['package_id']?.toString();
                      final icon = _getNotificationIcon(n['type']);

                      return Dismissible(
                        key: Key(id),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          margin: const EdgeInsets.only(bottom: 6),
                          decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(10)),
                          child: const Icon(LucideIcons.trash2, color: Colors.white, size: 20),
                        ),
                        onDismissed: (_) => _deleteNotification(id),
                        child: Card(
                          margin: const EdgeInsets.only(bottom: 6),
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                            leading: Container(
                              width: 40, height: 40,
                              decoration: BoxDecoration(
                                color: isRead ? AppColors.divider : AppColors.primaryBg,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(icon, size: 18, color: isRead ? AppColors.textMuted : AppColors.primary),
                            ),
                            title: Text(n['title'] ?? '', style: TextStyle(fontWeight: isRead ? FontWeight.w400 : FontWeight.w600, fontSize: 14)),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(n['message'] ?? '', style: Theme.of(context).textTheme.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                                const SizedBox(height: 2),
                                Text(_formatTime(n['created_at']), style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                              ],
                            ),
                            trailing: !isRead
                                ? Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle))
                                : null,
                            onTap: () async {
                              if (!isRead) {
                                try {
                                  await context.read<ApiService>().markNotificationRead(id);
                                  setState(() => n['is_read'] = true);
                                } catch (_) {}
                              }
                              if (packageId != null && packageId.isNotEmpty && mounted) {
                                context.push('/packages/$packageId');
                              }
                            },
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
