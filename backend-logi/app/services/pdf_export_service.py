"""
Service d'export PDF pour les listes (colis, clients, paiements, etc.)
Génère des PDF professionnels avec tableaux et filtres
"""

import io
import logging
from datetime import datetime
from flask import make_response
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

logger = logging.getLogger(__name__)


class PDFExportService:
    """Service pour générer des exports PDF"""
    
    def __init__(self, tenant_name="Express Cargo"):
        self.tenant_name = tenant_name
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Configure les styles personnalisés"""
        # Style titre
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=20,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.darkblue
        )
        
        # Style sous-titre
        self.subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            textColor=colors.darkblue
        )
        
        # Style en-tête tableau
        self.header_style = ParagraphStyle(
            'TableHeader',
            parent=self.styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.white,
            fontName='Helvetica-Bold'
        )
        
        # style normal tableau
        self.table_style = ParagraphStyle(
            'TableNormal',
            parent=self.styles['Normal'],
            fontSize=9
        )
    
    def _create_header(self, title, date_range=None, filters=None):
        """Crée l'en-tête du PDF"""
        story = []
        
        # Titre principal
        story.append(Paragraph(self.tenant_name.upper(), self.title_style))
        story.append(Paragraph(title, self.subtitle_style))
        
        # Informations de date
        if date_range:
            date_text = f"Période: {date_range}"
        else:
            date_text = f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}"
        
        story.append(Paragraph(date_text, self.styles['Normal']))
        
        # Filtres appliqués
        if filters:
            story.append(Spacer(1, 12))
            story.append(Paragraph("Filtres appliqués:", self.subtitle_style))
            for key, value in filters.items():
                if value:
                    filter_text = f"{key.replace('_', ' ').title()}: {value}"
                    story.append(Paragraph(filter_text, self.styles['Normal']))
        
        story.append(Spacer(1, 20))
        return story
    
    def _create_table(self, headers, data, column_widths=None):
        """Crée un tableau formaté"""
        if not data:
            return [Paragraph("Aucune donnée trouvée", self.styles['Normal'])]
        
        # Préparer les données
        table_data = []
        
        # En-tête
        header_row = []
        for header in headers:
            header_row.append(Paragraph(header, self.header_style))
        table_data.append(header_row)
        
        # Données
        for row in data:
            formatted_row = []
            for cell in row:
                if cell is None:
                    cell = 'N/A'
                elif isinstance(cell, (int, float)):
                    if isinstance(cell, float) and cell.is_integer():
                        cell = f"{int(cell)}"
                    else:
                        cell = f"{cell}"
                formatted_row.append(Paragraph(str(cell), self.table_style))
            table_data.append(formatted_row)
        
        # Largeurs des colonnes
        if column_widths is None:
            col_count = len(headers)
            column_widths = [A4[0] / col_count * 0.8] * col_count
        
        # Créer le tableau
        table = Table(table_data, colWidths=column_widths, repeatRows=1)
        
        # Style du tableau
        table.setStyle(TableStyle([
            # En-tête
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            
            # Lignes alternées
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
            
            # Bordures
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.darkblue),
            
            # Padding
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            
            # Alignement des colonnes numériques
            ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),  # Dernière colonne
        ]))
        
        return [table]
    
    def _create_footer(self, total_count=None, summary=None):
        """Crée le pied de page"""
        story = []
        
        story.append(Spacer(1, 30))
        
        # Total
        if total_count is not None:
            total_text = f"Total: {total_count} enregistrement{'s' if total_count > 1 else ''}"
            story.append(Paragraph(total_text, self.styles['Normal']))
        
        # Résumé
        if summary:
            story.append(Spacer(1, 12))
            story.append(Paragraph("Résumé:", self.subtitle_style))
            for key, value in summary.items():
                summary_text = f"{key}: {value}"
                story.append(Paragraph(summary_text, self.styles['Normal']))
        
        # Pied de page
        story.append(Spacer(1, 30))
        footer_text = f"""
        <br/><br/>
        <hr/>
        <para align="center" fontSize="8" textColor="gray">
        Document généré par {self.tenant_name} - {datetime.now().strftime('%d/%m/%Y %H:%M')}<br/>
        Système de gestion logistique Express Cargo
        </para>
        """
        
        story.append(Paragraph(footer_text, self.styles['Normal']))
        return story
    
    def export_packages(self, packages_data, title="Liste des Colis", 
                       date_range=None, filters=None, summary=None):
        """
        Exporte la liste des colis en PDF
        
        Args:
            packages_data: Liste des dictionnaires avec infos colis
            title: Titre du document
            date_range: Période (ex: "01/01/2024 - 31/01/2024")
            filters: Dictionnaire des filtres appliqués
            summary: Dictionnaire avec résumé statistique
        
        Returns:
            Flask Response avec le PDF
        """
        try:
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4)
            story = []
            
            # En-tête
            story.extend(self._create_header(title, date_range, filters))
            
            # Préparer les données
            if packages_data:
                headers = [
                    "N° Suivi", "Client", "Téléphone", "Description", 
                    "Statut", "Montant", "Payé", "Restant", "Date"
                ]
                
                data = []
                for pkg in packages_data:
                    data.append([
                        pkg.get('tracking_number', ''),
                        f"{pkg.get('client_first_name', '')} {pkg.get('client_last_name', '')}",
                        pkg.get('client_phone', ''),
                        (pkg.get('description', '')[:50] + '...') if len(pkg.get('description', '')) > 50 else pkg.get('description', ''),
                        pkg.get('status', ''),
                        f"{pkg.get('amount', 0):.0f}",
                        f"{pkg.get('paid_amount', 0):.0f}",
                        f"{pkg.get('remaining_amount', 0):.0f}",
                        pkg.get('created_at', '').split('T')[0] if pkg.get('created_at') else ''
                    ])
                
                # Largeurs des colonnes
                column_widths = [1.2*inch, 1.5*inch, 1*inch, 2*inch, 1*inch, 0.8*inch, 0.8*inch, 0.8*inch, 1*inch]
                
                # Tableau
                story.extend(self._create_table(headers, data, column_widths))
            else:
                story.append(Paragraph("Aucun colis trouvé", self.styles['Normal']))
            
            # Pied de page
            story.extend(self._create_footer(
                total_count=len(packages_data),
                summary=summary
            ))
            
            # Générer le PDF
            doc.build(story)
            
            # Préparer la réponse
            buffer.seek(0)
            pdf_data = buffer.getvalue()
            buffer.close()
            
            response = make_response(pdf_data)
            response.headers['Content-Type'] = 'application/pdf'
            response.headers['Content-Disposition'] = f'inline; filename=colis_{datetime.now().strftime("%Y%m%d_%H%M")}.pdf'
            response.headers['Content-Length'] = len(pdf_data)
            
            return response
            
        except Exception as e:
            logger.error(f"Erreur export PDF colis: {str(e)}")
            raise
    
    def export_clients(self, clients_data, title="Liste des Clients",
                      date_range=None, filters=None, summary=None):
        """Exporte la liste des clients en PDF"""
        try:
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4)
            story = []
            
            # En-tête
            story.extend(self._create_header(title, date_range, filters))
            
            # Préparer les données
            if clients_data:
                headers = [
                    "Nom", "Prénom", "Email", "Téléphone", 
                    "Nb Colis", "Total Montant", "Date d'inscription"
                ]
                
                data = []
                for client in clients_data:
                    data.append([
                        client.get('last_name', ''),
                        client.get('first_name', ''),
                        client.get('email', ''),
                        client.get('phone', ''),
                        client.get('package_count', 0),
                        f"{client.get('total_amount', 0):.0f}",
                        client.get('created_at', '').split('T')[0] if client.get('created_at') else ''
                    ])
                
                # Largeurs des colonnes
                column_widths = [1.5*inch, 1.5*inch, 2*inch, 1.2*inch, 0.8*inch, 1*inch, 1.2*inch]
                
                # Tableau
                story.extend(self._create_table(headers, data, column_widths))
            else:
                story.append(Paragraph("Aucun client trouvé", self.styles['Normal']))
            
            # Pied de page
            story.extend(self._create_footer(
                total_count=len(clients_data),
                summary=summary
            ))
            
            # Générer le PDF
            doc.build(story)
            
            # Préparer la réponse
            buffer.seek(0)
            pdf_data = buffer.getvalue()
            buffer.close()
            
            response = make_response(pdf_data)
            response.headers['Content-Type'] = 'application/pdf'
            response.headers['Content-Disposition'] = f'inline; filename=clients_{datetime.now().strftime("%Y%m%d_%H%M")}.pdf'
            response.headers['Content-Length'] = len(pdf_data)
            
            return response
            
        except Exception as e:
            logger.error(f"Erreur export PDF clients: {str(e)}")
            raise
    
    def export_pickups(self, pickups_data, title="Historique des Retraits",
                      date_range=None, filters=None, summary=None):
        """Exporte l'historique des retraits en PDF"""
        try:
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4)
            story = []
            
            # En-tête
            story.extend(self._create_header(title, date_range, filters))
            
            # Préparer les données
            if pickups_data:
                headers = [
                    "Date Retrait", "N° Suivi", "Client", "Retiré par", 
                    "Méthode", "Montant", "Entrepôt", "Statut"
                ]
                
                data = []
                for pickup in pickups_data:
                    data.append([
                        pickup.get('picked_up_at', '').split('T')[0] if pickup.get('picked_up_at') else '',
                        pickup.get('tracking_number', ''),
                        f"{pickup.get('client_first_name', '')} {pickup.get('client_last_name', '')}",
                        pickup.get('proxy_name', 'Client') if pickup.get('pickup_by') == 'proxy' else 'Client',
                        pickup.get('payment_method', ''),
                        f"{pickup.get('payment_collected', 0):.0f}",
                        pickup.get('warehouse_id', ''),
                        'Complété'
                    ])
                
                # Largeurs des colonnes
                column_widths = [1.2*inch, 1.2*inch, 1.8*inch, 1.5*inch, 1*inch, 0.8*inch, 1.2*inch, 1*inch]
                
                # Tableau
                story.extend(self._create_table(headers, data, column_widths))
            else:
                story.append(Paragraph("Aucun retrait trouvé", self.styles['Normal']))
            
            # Pied de page
            story.extend(self._create_footer(
                total_count=len(pickups_data),
                summary=summary
            ))
            
            # Générer le PDF
            doc.build(story)
            
            # Préparer la réponse
            buffer.seek(0)
            pdf_data = buffer.getvalue()
            buffer.close()
            
            response = make_response(pdf_data)
            response.headers['Content-Type'] = 'application/pdf'
            response.headers['Content-Disposition'] = f'inline; filename=retraits_{datetime.now().strftime("%Y%m%d_%H%M")}.pdf'
            response.headers['Content-Length'] = len(pdf_data)
            
            return response
            
        except Exception as e:
            logger.error(f"Erreur export PDF retraits: {str(e)}")
            raise
