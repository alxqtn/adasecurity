# 🔐 Atelier Sécurité Web - Tweety

## Contexte

Application Tweety préparée pour un atelier de sécurité web. Les participants vont découvrir et exploiter 3 failles, puis les corriger.

## Démarrage rapide

```bash
npm install
npm start
# Ouvrir http://localhost:3001
```

**Utilisateurs disponibles :** alice/password123, bob/hunter2, charlie/123456

---

# 🔴 FAILLE 1 : Injection SQL

## 📋 Exploitation

### Attaque 1 : Se connecter en tant que bob sans mot de passe

#### Valeurs à entrer
- **Nom d'utilisateur** : `bob' --`
- **Mot de passe** : `nimportequoi`

#### Résultat
✅ Connecté en tant que bob SANS connaître son mot de passe !

---

### Attaque 2 : Se connecter en tant que le premier utilisateur

#### Valeurs à entrer
- **Nom d'utilisateur** : `' OR '1'='1' --`
- **Mot de passe** : `nimportequoi`

#### Résultat
✅ Connecté automatiquement en tant qu'alice (premier user de la base)

---

### Attaque 3 : Extraire un mot de passe

#### Valeurs à entrer
- **Nom d'utilisateur** :
  ```
  ' UNION SELECT 1, password, username FROM users WHERE username='bob' --
  ```
- **Mot de passe** : `x`

#### Résultat
✅ Le message de bienvenue affiche `hunter2` (le mot de passe de bob !)

---

## 💡 Explication

**Où est la faille ?**

Fichier `index.js`, ligne **83**, fonction `POST /api/login` :
```javascript
const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
```

Les valeurs sont directement insérées dans la requête SQL sans protection.

Avec le mot de passe `' OR '1'='1' --`, la requête devient :
```sql
SELECT * FROM users WHERE username = 'alice' AND password = '' OR '1'='1' --'
```
- `'1'='1'` est toujours vrai → authentification réussie
- `--` commente le reste de la requête

---

## 🔧 Correction

**Fichier : `index.js`**

**Avant (lignes 83-84) :**
```javascript
const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
const row = db.prepare(query).get();
```

**Après :**
```javascript
const row = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password);
```

### Ce qui change
1. **Query** : `'${username}'` → `?` (paramètres)
2. **Exécution** : `.get()` sans args → `.get(username, password)` (paramètres passés à la fin)

### Test
- Login `alice`/`password123` → ✅ fonctionne
- Login `alice' --`/`nimportequoi` → ✅ "Identifiants invalides"

> ⚠️ **Note** : Cette correction empêche l'injection SQL, mais ne règle pas le problème du stockage des mots de passe en clair. Dans une application sécurisée, les mots de passe seraient hachés (bcrypt, argon2...) et l'attaque UNION n'afficherait qu'un hash inexploitable, pas `hunter2`.

---

# 🔴 FAILLE 2 : Usurpation d'identité (Trust Client)

## 📋 Exploitation

### Étape 1 : Se connecter
- Login avec `alice`/`password123`

### Étape 2 : Ouvrir DevTools
Appuyer sur **Ctrl/Cmd + Maj + I** → Onglet **Network**

### Étape 3 : Poster un message
Dans la zone de texte, écrire n'importe quoi (ex: "Hello") et cliquer "Poster"

### Étape 4 : Observer la requête
1. Dans l'onglet Network, cliquer sur la requête `posts` (méthode POST)
2. Onglet **Payload** (ou **Request**)
3. Observer le corps de la requête :
```json
{"username":"alice","content":"Hello"}
```

### Étape 5 : Usurper l'identité de bob

#### Option A : Via la Console
```javascript
fetch("/api/posts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "bob", content: "Je suis bob... ou pas 😈" })
})

Ensuite rafraîchir
```

#### Option B : Via cURL (terminal)
```bash
curl -X POST http://localhost:3001/api/posts \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","content":"Message posté sans être connecté!"}'
```

#### Résultat
✅ Un message apparaît au nom de `bob` alors qu'on est connecté en tant qu'`alice` !

---

## 💡 Explication

**Où est la faille ?**

1. **Fichier `public/app.js`, ligne 125** : Le frontend envoie `username: currentUser`
2. **Fichier `index.js`, ligne 108** : Le serveur accepte le `username` sans vérification

**Règle d'or** : Ne jamais faire confiance aux données venant du client !

---

## 🔧 Correction

Le serveur doit déterminer l'identité de l'utilisateur via une **session** côté serveur, pas via le client.

### Backend (`index.js`)

**Avant :**
```javascript
app.post("/api/posts", (req, res) => {
  const { username, content } = req.body;
  // ...
});
```

**Après (avec sessions) :**
```javascript
// En haut du fichier
const session = require("express-session");
app.use(session({ secret: "secret-key", resave: false, saveUninitialized: false }));

// Route login - stocker l'utilisateur en session
app.post("/api/login", (req, res) => {
  // ... vérification ...
  if (row) {
    req.session.username = row.username;  // ← Stocker en session
    res.json({ success: true, username: row.username });
  } // else {}
});

// Route posts - utiliser la session, pas le body
app.post("/api/posts", (req, res) => {
  const username = req.session.username;  // ← Vient de la session, pas du client
  const { content } = req.body;

  if (!username) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  // ...
});
```

### Frontend (`public/app.js`)

**Avant :**
```javascript
body: JSON.stringify({ username: currentUser, content })
```

**Après :**
```javascript
body: JSON.stringify({ content })  // Plus besoin d'envoyer le username
```

### Test
1. Se connecter en tant qu'alice
2. Dans la console : `fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "bob", content: "test" }) })`
3. ✅ Le message est posté au nom d'`alice` (session), pas `bob`

---

# 🔴 FAILLE 3 : XSS Stocké

## 📋 Exploitation

### Attaque 1 : Modifier l'apparence de la page

#### Étape 1 : Se connecter avec `alice`/`password123`

#### Étape 2 : Poster ce message
```html
<style>body{background:red !important;color:white !important}</style>🔥 PAGE HACKÉE 🔥
```

#### Résultat
✅ La page devient rouge pour TOUS les utilisateurs qui la visitent !

---

### Attaque 2 : Poster un message à la place des autres utilisateurs

#### Poster ce message :
```html
<img src=x onerror="fetch('/api/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:currentUser||'victime',content:'😈 Message posté sans mon consentement!'})})">
```

#### Résultat
✅ Quand un autre utilisateur voit ce post, un message est automatiquement posté en son nom !

**Test :**
1. Se déconnecter
2. Se reconnecter avec `bob`/`hunter2`
3. Regarder la timeline → un message "😈 Message posté sans mon consentement!" apparaît au nom de bob

---

## 💡 Explication

**Où est la faille ?**

Fichier `public/app.js`, ligne **96**, dans la fonction `renderPosts()` :
```javascript
postDiv.querySelector('.post-content').innerHTML = post.content;
```

Le contenu du post est inséré avec `innerHTML`, ce qui exécute le code HTML/JavaScript.

---

## 🔧 Correction

**Fichier : `public/app.js`**

Trouver la ligne :
```javascript
postDiv.querySelector('.post-content').innerHTML = post.content;
```

Remplacer par :
```javascript
postDiv.querySelector('.post-content').textContent = post.content;
```

`textContent` affiche le texte tel quel sans l'interpréter comme du HTML.

### Test
1. Rafraîchir la page
2. Les anciens posts XSS s'affichent comme du texte brut
3. Poster `<b>test</b>` → ✅ affiche `<b>test</b>` au lieu de **test**

---

## 📚 Les autres types de XSS

**L'exemple ci-dessus est un XSS stocké** (payload enregistré en base et exécuté pour tous les visiteurs).

### XSS Réfléchi

Payload non stocké — il est "réfléchi" immédiatement par le serveur. Exemple : un lien piégé `site.com/search?q=<script>evil()</script>` où la page affiche le terme recherché sans échapper. La victime doit cliquer sur le lien pour être infectée.

---

## 🛡️ React protège par défaut

**Bonne nouvelle :** React échappe automatiquement les valeurs dans le JSX. `<div>{userInput}</div>` est sécurisé.

**⚠️ Attention :** Il reste des risques si vous utilisez des inputs utilisateur dans :

1. **`dangerouslySetInnerHTML`** — nécessite une sanitization :
```jsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

2. **Les liens `href`/`src`** — React ne protège PAS contre `javascript:` :
```jsx
// ❌ DANGEREUX — l'utilisateur peut injecter javascript:alert(1)
<a href={userWebsite}>Mon site</a>
<img src={userImage} />

// ✅ SÉCURISÉ — vérifier le protocole
<a href={userWebsite?.startsWith('http') ? userWebsite : '#'}>Mon site</a>
```

---

# 📝 Résumé des modifications

| Faille | Fichier | Modification |
|--------|---------|--------------|
| SQL Injection | `index.js` | Requête préparée avec `?` |
| Trust Client | `index.js` | Utiliser sessions au lieu du body |
| Trust Client | `public/app.js` | Ne plus envoyer le username |
| XSS | `public/app.js` | `innerHTML` → `textContent` |

---

# 🧪 Vérification finale

1. **SQL** : Login `alice' --`/`nimportequoi` → "Identifiants invalides"
2. **Trust Client** : Poster avec un faux username → le serveur utilise la session
3. **XSS** : Poster `<b>gras</b>` → affiche `<b>gras</b>` en texte

---

## 📚 Ressources supplémentaires

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
