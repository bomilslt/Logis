import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';

class TemplatesScreen extends StatefulWidget {
  const TemplatesScreen({super.key});

  @override
  State<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends State<TemplatesScreen> {
  List<Map<String, dynamic>> _templates = [];
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
      final data = await api.getTemplates();
      if (mounted) {
        setState(() {
          _templates = List<Map<String, dynamic>>.from(data['templates'] ?? []);
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _deleteTemplate(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer le template'),
        content: const Text('Voulez-vous vraiment supprimer ce template ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await context.read<ApiService>().deleteTemplate(id);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Template supprimé'), backgroundColor: AppColors.success),
        );
        _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: AppColors.error),
          );
        }
      }
    }
  }

  void _useTemplate(Map<String, dynamic> tpl) {
    // Navigate to new-package with template data pre-filled
    context.push('/new-package', extra: tpl);
  }

  Future<void> _editTemplate(Map<String, dynamic> tpl) async {
    final updated = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => _EditTemplateSheet(template: tpl)),
    );
    if (updated == true && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Mes templates'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _templates.isEmpty
              ? _buildEmpty()
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _templates.length + 1, // +1 for intro text
                    itemBuilder: (_, i) {
                      if (i == 0) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Text(
                            'Sauvegardez vos destinataires fréquents pour remplir rapidement vos formulaires.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        );
                      }
                      final tpl = _templates[i - 1];
                      return _buildTemplateCard(tpl);
                    },
                  ),
                ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(LucideIcons.users, size: 48, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text('Aucun template', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('Créez votre premier template lors de l\'ajout d\'un colis',
              style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => context.go('/new-package'),
            icon: const Icon(LucideIcons.plus, size: 18),
            label: const Text('Nouveau colis'),
          ),
        ]),
      ),
    );
  }

  Widget _buildTemplateCard(Map<String, dynamic> tpl) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: AppColors.primaryBg, borderRadius: BorderRadius.circular(10)),
                  child: const Icon(LucideIcons.user, size: 18, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tpl['name'] ?? 'Sans nom', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    Text(tpl['recipient_name'] ?? 'Destinataire', style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ),
                IconButton(
                  icon: const Icon(LucideIcons.pencil, size: 18, color: AppColors.textSecondary),
                  onPressed: () => _editTemplate(tpl),
                ),
                IconButton(
                  icon: const Icon(LucideIcons.trash2, size: 18, color: AppColors.error),
                  onPressed: () => _deleteTemplate(tpl['id'].toString()),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(LucideIcons.phone, size: 14, color: AppColors.textMuted),
              const SizedBox(width: 6),
              Text(tpl['recipient_phone'] ?? 'N/A', style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(width: 16),
              const Icon(LucideIcons.mapPin, size: 14, color: AppColors.textMuted),
              const SizedBox(width: 6),
              Expanded(child: Text('${tpl['country'] ?? ''} - ${tpl['warehouse'] ?? ''}', style: Theme.of(context).textTheme.bodySmall, overflow: TextOverflow.ellipsis)),
            ]),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => _useTemplate(tpl),
                child: const Text('Utiliser ce template'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Edit Template Screen (private, same file) ────────────────────

class _EditTemplateSheet extends StatefulWidget {
  final Map<String, dynamic> template;
  const _EditTemplateSheet({required this.template});

  @override
  State<_EditTemplateSheet> createState() => _EditTemplateSheetState();
}

class _EditTemplateSheetState extends State<_EditTemplateSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _recipientNameCtrl;
  late final TextEditingController _recipientPhoneCtrl;
  late final TextEditingController _recipientAddressCtrl;
  late final TextEditingController _countryCtrl;
  late final TextEditingController _warehouseCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final tpl = widget.template;
    _nameCtrl = TextEditingController(text: tpl['name'] ?? '');
    _recipientNameCtrl = TextEditingController(text: tpl['recipient_name'] ?? '');
    _recipientPhoneCtrl = TextEditingController(text: tpl['recipient_phone'] ?? '');
    _recipientAddressCtrl = TextEditingController(text: tpl['recipient_address'] ?? '');
    _countryCtrl = TextEditingController(text: tpl['country'] ?? '');
    _warehouseCtrl = TextEditingController(text: tpl['warehouse'] ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _recipientNameCtrl.dispose();
    _recipientPhoneCtrl.dispose();
    _recipientAddressCtrl.dispose();
    _countryCtrl.dispose();
    _warehouseCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);

    try {
      await context.read<ApiService>().updateTemplate(
        widget.template['id'].toString(),
        {
          'name': _nameCtrl.text.trim(),
          'recipient_name': _recipientNameCtrl.text.trim(),
          'recipient_phone': _recipientPhoneCtrl.text.trim(),
          'recipient_address': _recipientAddressCtrl.text.trim(),
          'country': _countryCtrl.text.trim(),
          'warehouse': _warehouseCtrl.text.trim(),
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Template mis à jour'), backgroundColor: AppColors.success),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Modifier le template'),
        actions: [
          TextButton(
            onPressed: _saving ? null : _handleSave,
            child: _saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Enregistrer'),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(labelText: 'Nom du template'),
                  validator: (v) => v == null || v.isEmpty ? 'Requis' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _recipientNameCtrl,
                  decoration: const InputDecoration(labelText: 'Nom du destinataire'),
                  validator: (v) => v == null || v.isEmpty ? 'Requis' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _recipientPhoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Téléphone du destinataire'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _recipientAddressCtrl,
                  decoration: const InputDecoration(labelText: 'Adresse du destinataire'),
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _countryCtrl,
                  decoration: const InputDecoration(labelText: 'Pays de destination'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _warehouseCtrl,
                  decoration: const InputDecoration(labelText: 'Entrepôt'),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  height: 50,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _handleSave,
                    child: _saving
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Enregistrer les modifications'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
