<p align="center">
  <a href="https://openloom.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo Openloom">
    </picture>
  </a>
</p>
<p align="center">L'agent de codage IA open source.</p>
<p align="center">
  <a href="https://openloom.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/openloom-ai"><img alt="npm" src="https://img.shields.io/npm/v/openloom-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/openloom/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/openloom/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![Openloom Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://openloom.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://openloom.ai/install | bash

# Gestionnaires de paquets
npm i -g opencode-ai@latest        # ou bun/pnpm/yarn
scoop install openloom             # Windows
choco install openloom             # Windows
brew install anomalyco/tap/openloom # macOS et Linux (recommandé, toujours à jour)
brew install openloom              # macOS et Linux (formule officielle brew, mise à jour moins fréquente)
sudo pacman -S openloom            # Arch Linux (Stable)
paru -S openloom-bin               # Arch Linux (Latest from AUR)
mise use -g openloom               # n'importe quel OS
nix run nixpkgs#openloom           # ou github:anomalyco/openloom pour la branche dev la plus récente
```

> [!TIP]
> Supprimez les versions antérieures à 0.1.x avant d'installer.

### Application de bureau (BETA)

Openloom est aussi disponible en application de bureau. Téléchargez-la directement depuis la [page des releases](https://github.com/anomalyco/openloom/releases) ou [openloom.ai/download](https://openloom.ai/download).

| Plateforme            | Téléchargement                     |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `openloom-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `openloom-desktop-mac-x64.dmg`     |
| Windows               | `openloom-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, ou AppImage        |

```bash
# macOS (Homebrew)
brew install --cask openloom-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/openloom-desktop
```

#### Répertoire d'installation

Le script d'installation respecte l'ordre de priorité suivant pour le chemin d'installation :

1. `$OPENLOOM_INSTALL_DIR` - Répertoire d'installation personnalisé
2. `$XDG_BIN_DIR` - Chemin conforme à la spécification XDG Base Directory
3. `$HOME/bin` - Répertoire binaire utilisateur standard (s'il existe ou peut être créé)
4. `$HOME/.openloom/bin` - Repli par défaut

```bash
# Exemples
OPENLOOM_INSTALL_DIR=/usr/local/bin curl -fsSL https://openloom.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://openloom.ai/install | bash
```

### Agents

Openloom inclut deux agents intégrés que vous pouvez basculer avec la touche `Tab`.

- **build** - Par défaut, agent avec accès complet pour le travail de développement
- **plan** - Agent en lecture seule pour l'analyse et l'exploration du code
  - Refuse les modifications de fichiers par défaut
  - Demande l'autorisation avant d'exécuter des commandes bash
  - Idéal pour explorer une base de code inconnue ou planifier des changements

Un sous-agent **general** est aussi inclus pour les recherches complexes et les tâches en plusieurs étapes.
Il est utilisé en interne et peut être invoqué via `@general` dans les messages.

En savoir plus sur les [agents](https://openloom.ai/docs/agents).

### Documentation

Pour plus d'informations sur la configuration d'Openloom, [**consultez notre documentation**](https://openloom.ai/docs).

### Contribuer

Si vous souhaitez contribuer à Openloom, lisez nos [docs de contribution](./CONTRIBUTING.md) avant de soumettre une pull request.

### Construire avec Openloom

Si vous travaillez sur un projet lié à Openloom et que vous utilisez "openloom" dans le nom du projet (par exemple, "openloom-dashboard" ou "openloom-mobile"), ajoutez une note dans votre README pour préciser qu'il n'est pas construit par l'équipe Openloom et qu'il n'est pas affilié à nous.

### FAQ

#### En quoi est-ce différent de Claude Code ?

C'est très similaire à Claude Code en termes de capacités. Voici les principales différences :

- 100% open source
- Pas couplé à un fournisseur. Nous recommandons les modèles proposés via [Openloom Zen](https://openloom.ai/zen) ; Openloom peut être utilisé avec Claude, OpenAI, Google ou même des modèles locaux. Au fur et à mesure que les modèles évoluent, les écarts se réduiront et les prix baisseront, donc être agnostique au fournisseur est important.
- Support LSP prêt à l'emploi
- Un focus sur la TUI. Openloom est construit par des utilisateurs de neovim et les créateurs de [terminal.shop](https://terminal.shop) ; nous allons repousser les limites de ce qui est possible dans le terminal.
- Architecture client/serveur. Cela permet par exemple de faire tourner Openloom sur votre ordinateur tout en le pilotant à distance depuis une application mobile. Cela signifie que la TUI n'est qu'un des clients possibles.

---

**Rejoignez notre communauté** [Discord](https://discord.gg/openloom) | [X.com](https://x.com/openloom)
