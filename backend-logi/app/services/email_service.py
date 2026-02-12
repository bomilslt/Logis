"""
Service Email - Envoi d'emails via différents providers
Providers supportés: SendGrid, Mailgun, SMTP
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class EmailProvider(ABC):
    """Interface abstraite pour les providers Email"""
    
    @abstractmethod
    def send(self, to: str, subject: str, body: str, html: str = None) -> dict:
        """Envoie un email"""
        pass


class SendGridEmailProvider(EmailProvider):
    """
    Provider Email SendGrid
    
    Configuration requise:
        - api_key: Clé API SendGrid
        - from_email: Email expéditeur vérifié
        - from_name: Nom expéditeur (optionnel)
    """
    
    def __init__(self, config: dict):
        self.api_key = config.get('api_key')
        self.from_email = config.get('from_email')
        self.from_name = config.get('from_name', 'Express Cargo')
        
        if not all([self.api_key, self.from_email]):
            raise ValueError("SendGrid config requires: api_key, from_email")
        
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Email, To, Content
            self.client = SendGridAPIClient(self.api_key)
            self.Mail = Mail
            self.Email = Email
            self.To = To
            self.Content = Content
        except ImportError:
            raise ImportError("Package 'sendgrid' not installed. Run: pip install sendgrid")
    
    def send(self, to: str, subject: str, body: str, html: str = None) -> dict:
        """Envoie un email via SendGrid"""
        try:
            from_email = self.Email(self.from_email, self.from_name)
            to_email = self.To(to)
            
            # Créer le message
            message = self.Mail(
                from_email=from_email,
                to_emails=to_email,
                subject=subject
            )
            
            # Ajouter le contenu texte
            message.add_content(self.Content('text/plain', body))
            
            # Ajouter le contenu HTML si fourni
            if html:
                message.add_content(self.Content('text/html', html))
            
            response = self.client.send(message)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"Email SendGrid sent to {to}")
                return {
                    'success': True,
                    'provider': 'sendgrid',
                    'status_code': response.status_code,
                    'to': to
                }
            else:
                logger.error(f"SendGrid error: {response.status_code}")
                return {
                    'success': False,
                    'provider': 'sendgrid',
                    'error': f'Status code: {response.status_code}',
                    'to': to
                }
        except Exception as e:
            logger.error(f"SendGrid error: {str(e)}")
            return {
                'success': False,
                'provider': 'sendgrid',
                'error': str(e),
                'to': to
            }


class MailgunEmailProvider(EmailProvider):
    """
    Provider Email Mailgun
    
    Configuration requise:
        - api_key: Clé API Mailgun
        - domain: Domaine Mailgun vérifié
        - from_email: Email expéditeur
        - from_name: Nom expéditeur (optionnel)
        - region: 'us' ou 'eu' (défaut: us)
    """
    
    def __init__(self, config: dict):
        self.api_key = config.get('api_key')
        self.domain = config.get('domain')
        self.from_email = config.get('from_email')
        self.from_name = config.get('from_name', 'Express Cargo')
        self.region = config.get('region', 'us')
        
        if not all([self.api_key, self.domain, self.from_email]):
            raise ValueError("Mailgun config requires: api_key, domain, from_email")
        
        # URL selon la région
        if self.region == 'eu':
            self.base_url = f"https://api.eu.mailgun.net/v3/{self.domain}"
        else:
            self.base_url = f"https://api.mailgun.net/v3/{self.domain}"
        
        try:
            import requests
            self.requests = requests
        except ImportError:
            raise ImportError("Package 'requests' not installed. Run: pip install requests")
    
    def send(self, to: str, subject: str, body: str, html: str = None) -> dict:
        """Envoie un email via Mailgun"""
        try:
            from_str = f"{self.from_name} <{self.from_email}>"
            
            data = {
                'from': from_str,
                'to': to,
                'subject': subject,
                'text': body
            }
            
            if html:
                data['html'] = html
            
            response = self.requests.post(
                f"{self.base_url}/messages",
                auth=('api', self.api_key),
                data=data
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Email Mailgun sent to {to}: {result.get('id')}")
                return {
                    'success': True,
                    'provider': 'mailgun',
                    'message_id': result.get('id'),
                    'to': to
                }
            else:
                error = response.json().get('message', 'Unknown error')
                logger.error(f"Mailgun error: {error}")
                return {
                    'success': False,
                    'provider': 'mailgun',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"Mailgun error: {str(e)}")
            return {
                'success': False,
                'provider': 'mailgun',
                'error': str(e),
                'to': to
            }


class SMTPEmailProvider(EmailProvider):
    """
    Provider Email SMTP générique
    Compatible avec Gmail, Outlook, serveurs SMTP personnalisés
    
    Configuration requise:
        - host: Serveur SMTP (ex: smtp.gmail.com)
        - port: Port SMTP (587 pour TLS, 465 pour SSL)
        - username: Nom d'utilisateur/email
        - password: Mot de passe ou app password
        - from_email: Email expéditeur
        - from_name: Nom expéditeur (optionnel)
        - use_tls: Utiliser TLS (défaut: True)
        - use_ssl: Utiliser SSL (défaut: False)
    """
    
    def __init__(self, config: dict):
        self.host = config.get('host')
        self.port = config.get('port', 587)
        self.username = config.get('username')
        self.password = config.get('password')
        self.from_email = config.get('from_email')
        self.from_name = config.get('from_name', 'Express Cargo')
        self.use_tls = config.get('use_tls', True)
        self.use_ssl = config.get('use_ssl', False)
        
        if not all([self.host, self.username, self.password, self.from_email]):
            raise ValueError("SMTP config requires: host, username, password, from_email")
    
    def send(self, to: str, subject: str, body: str, html: str = None) -> dict:
        """Envoie un email via SMTP"""
        try:
            # Créer le message
            if html:
                msg = MIMEMultipart('alternative')
                msg.attach(MIMEText(body, 'plain', 'utf-8'))
                msg.attach(MIMEText(html, 'html', 'utf-8'))
            else:
                msg = MIMEText(body, 'plain', 'utf-8')
            
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to
            
            # Connexion et envoi
            if self.use_ssl:
                server = smtplib.SMTP_SSL(self.host, self.port)
            else:
                server = smtplib.SMTP(self.host, self.port)
                if self.use_tls:
                    server.starttls()
            
            server.login(self.username, self.password)
            server.sendmail(self.from_email, [to], msg.as_string())
            server.quit()
            
            logger.info(f"Email SMTP sent to {to}")
            return {
                'success': True,
                'provider': 'smtp',
                'to': to
            }
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP auth error: {str(e)}")
            return {
                'success': False,
                'provider': 'smtp',
                'error': 'Authentication failed. Check username/password.',
                'to': to
            }
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {str(e)}")
            return {
                'success': False,
                'provider': 'smtp',
                'error': str(e),
                'to': to
            }
        except Exception as e:
            logger.error(f"SMTP error: {str(e)}")
            return {
                'success': False,
                'provider': 'smtp',
                'error': str(e),
                'to': to
            }


class AWSEmailProvider(EmailProvider):
    """
    Provider Email AWS SES (Simple Email Service)
    Service d'email transactionnel d'Amazon - très économique et scalable
    
    Configuration requise:
        - api_key: AWS Access Key ID (ou aws_access_key_id)
        - aws_secret_access_key: AWS Secret Access Key
        - region: Région AWS (ex: us-east-1, eu-west-1)
        - from_email: Email expéditeur vérifié dans SES
        - from_name: Nom expéditeur (optionnel)
    """
    
    def __init__(self, config: dict):
        # Supporter les deux formats de clés
        self.aws_access_key_id = config.get('api_key') or config.get('aws_access_key_id')
        self.aws_secret_access_key = config.get('aws_secret_access_key')
        self.region = config.get('region', 'us-east-1')
        self.from_email = config.get('from_email')
        self.from_name = config.get('from_name', 'Express Cargo')
        
        if not all([self.aws_access_key_id, self.aws_secret_access_key, self.from_email]):
            raise ValueError("AWS SES config requires: api_key (or aws_access_key_id), aws_secret_access_key, from_email")
        
        # Import boto3 dynamiquement
        try:
            import boto3
            self.ses_client = boto3.client(
                'ses',
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=self.region
            )
        except ImportError:
            raise ImportError("Package 'boto3' not installed. Run: pip install boto3")
    
    def send(self, to: str, subject: str, body: str, html: str = None) -> dict:
        """Envoie un email via AWS SES"""
        try:
            # Préparer le message
            message = {
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': {
                    'Text': {'Data': body, 'Charset': 'UTF-8'}
                }
            }
            
            # Ajouter le HTML si fourni
            if html:
                message['Body']['Html'] = {'Data': html, 'Charset': 'UTF-8'}
            
            # Envoyer via SES
            response = self.ses_client.send_email(
                Source=f"{self.from_name} <{self.from_email}>",
                Destination={'ToAddresses': [to]},
                Message=message
            )
            
            message_id = response.get('MessageId')
            logger.info(f"Email AWS SES sent to {to}: {message_id}")
            
            return {
                'success': True,
                'provider': 'aws_ses',
                'message_id': message_id,
                'to': to
            }
            
        except Exception as e:
            logger.error(f"AWS SES error: {str(e)}")
            return {
                'success': False,
                'provider': 'aws_ses',
                'error': str(e),
                'to': to
            }


class EmailService:
    """
    Service Email principal
    Gère la sélection du provider et l'envoi des emails
    """
    
    PROVIDERS = {
        'sendgrid': SendGridEmailProvider,
        'mailgun': MailgunEmailProvider,
        'smtp': SMTPEmailProvider,
        'gmail': SMTPEmailProvider,  # Alias avec config pré-remplie
        'outlook': SMTPEmailProvider,  # Alias avec config pré-remplie
        'aws_ses': AWSEmailProvider  # Amazon SES
    }
    
    # Configurations SMTP pré-définies
    SMTP_PRESETS = {
        'gmail': {
            'host': 'smtp.gmail.com',
            'port': 587,
            'use_tls': True
        },
        'outlook': {
            'host': 'smtp.office365.com',
            'port': 587,
            'use_tls': True
        },
        'yahoo': {
            'host': 'smtp.mail.yahoo.com',
            'port': 587,
            'use_tls': True
        }
    }
    
    def __init__(self, provider_name: str, config: dict):
        """
        Initialise le service Email
        
        Args:
            provider_name: Nom du provider (sendgrid, mailgun, smtp, gmail, outlook)
            config: Configuration du provider
        """
        provider_class = self.PROVIDERS.get(provider_name.lower())
        
        if not provider_class:
            raise ValueError(f"Unknown Email provider: {provider_name}. Available: {list(self.PROVIDERS.keys())}")
        
        # Appliquer les presets SMTP si applicable
        if provider_name.lower() in self.SMTP_PRESETS:
            preset = self.SMTP_PRESETS[provider_name.lower()]
            # Fusionner avec la config utilisateur
            config = {**preset, **config}
        
        # Mapper les champs de l'interface admin vers les champs attendus par SMTP
        if provider_name.lower() in ['smtp', 'gmail', 'outlook']:
            # L'interface admin envoie: api_key, from_email, from_name
            # Le service SMTP attend: host, username, password, from_email, from_name
            if 'api_key' in config and 'from_email' in config:
                config['username'] = config['from_email']  # Username = email pour Gmail/Outlook
                config['password'] = config['api_key']     # API key = mot de passe d'app
                
                # Ajouter les hosts par défaut si pas spécifiés
                if 'host' not in config:
                    if 'gmail.com' in config['from_email']:
                        config['host'] = 'smtp.gmail.com'
                        config['port'] = 587
                        config['use_tls'] = True
                        # Configurer Reply-To pour un email professionnel
                        if 'reply_to' not in config:
                            config['reply_to'] = config['from_email']
                    elif any(domain in config['from_email'] for domain in ['outlook.com', 'hotmail.com', 'live.com']):
                        config['host'] = 'smtp-mail.outlook.com'
                        config['port'] = 587
                        config['use_tls'] = True
                        if 'reply_to' not in config:
                            config['reply_to'] = config['from_email']
                    else:
                        # SMTP générique
                        config.setdefault('host', 'smtp.gmail.com')
                        config.setdefault('port', 587)
                        config.setdefault('use_tls', True)
        
        self.provider = provider_class(config)
        self.provider_name = provider_name
    
    def send(self, to: str, subject: str, body: str, html: str = None) -> dict:
        """
        Envoie un email
        
        Args:
            to: Adresse email destinataire
            subject: Sujet de l'email
            body: Corps du message (texte)
            html: Corps du message (HTML, optionnel)
        
        Returns:
            Résultat de l'envoi
        """
        # Validation basique
        if not to or '@' not in to:
            return {
                'success': False,
                'error': 'Invalid email address',
                'to': to
            }
        
        return self.provider.send(to, subject, body, html)
    
    def send_html(self, to: str, subject: str, html: str, text_fallback: str = None) -> dict:
        """
        Envoie un email HTML
        
        Args:
            to: Adresse email destinataire
            subject: Sujet
            html: Contenu HTML
            text_fallback: Version texte (générée automatiquement si absente)
        """
        if not text_fallback:
            # Générer une version texte basique
            import re
            text_fallback = re.sub('<[^<]+?>', '', html)
        
        return self.send(to, subject, text_fallback, html)
