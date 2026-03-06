# 🚀 Guide de déploiement — kwikwiii.online

## Vue d'ensemble finale

```
kwikwiii.online       → Nginx → Node.js port 3001 (site vitrine)  ← NOUVEAU
app.kwikwiii.online   → Nginx → Node.js port 3000 (jeu Twitch)    ← INCHANGÉ
```

---

## Étape 1 — Créer le repo GitHub

En local sur ta machine :

```bash
mkdir kwikwiii-site
cd kwikwiii-site
git init
git remote add origin git@github.com:TON_USER/kwikwiii-site.git
```

Copie dedans les fichiers fournis :
```
kwikwiii-site/
├── server.js
├── package.json
├── .gitignore
├── .env.example        ← committer ça (pas de clés dedans)
├── public/
│   └── index.html
└── routes/
    └── twitch-schedule.js
```

```bash
git add .
git commit -m "feat: init site vitrine kwikwiii"
git push -u origin main
```

---

## Étape 2 — Sur le serveur OVH (via SSH)

```bash
ssh user@kwikwiii.online

# Cloner le repo
cd /var/www
git clone git@github.com:TON_USER/kwikwiii-site.git kwikwiii-site
cd kwikwiii-site

# Installer les dépendances
npm install

# Créer le fichier .env avec tes vraies clés
nano .env
```

Contenu du `.env` :
```env
PORT=3001
TWITCH_CLIENT_ID=ton_vrai_client_id
TWITCH_CLIENT_SECRET=ton_vrai_client_secret
```

```bash
# Lancer avec PM2
pm2 start server.js --name kwikwiii-site
pm2 save       # sauvegarder pour redémarrage auto
pm2 list       # vérifier que ça tourne
```

---

## Étape 3 — Configurer Nginx

```bash
sudo nano /etc/nginx/sites-available/kwikwiii-site
```

Colle cette configuration :

```nginx
server {
    listen 80;
    server_name kwikwiii.online www.kwikwiii.online;

    # Redirection HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name kwikwiii.online www.kwikwiii.online;

    # Certificat SSL (Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/kwikwiii.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kwikwiii.online/privkey.pem;

    # Proxy vers le serveur Node.js
    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Activer le site
sudo ln -s /etc/nginx/sites-available/kwikwiii-site /etc/nginx/sites-enabled/

# Vérifier la config Nginx
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

---

## Étape 4 — Certificat SSL avec Let's Encrypt

Si pas encore de certificat pour kwikwiii.online :

```bash
sudo certbot --nginx -d kwikwiii.online -d www.kwikwiii.online
```

---

## Étape 5 — Workflow de déploiement (pour les mises à jour futures)

En local :
```bash
# Modifier tes fichiers...
git add .
git commit -m "update: ..."
git push origin main
```

Sur le serveur :
```bash
ssh user@kwikwiii.online
cd /var/www/kwikwiii-site
git pull origin main
pm2 restart kwikwiii-site
```

---

## Vérifications

| URL | Résultat attendu |
|-----|-----------------|
| `https://kwikwiii.online` | Site vitrine ✅ |
| `https://kwikwiii.online/api/twitch-schedule` | JSON du planning ✅ |
| `https://app.kwikwiii.online` | Jeu Twitch (inchangé) ✅ |