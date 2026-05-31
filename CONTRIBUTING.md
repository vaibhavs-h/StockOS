# Contributing to StockOS

Thank you for your interest in contributing to StockOS.

StockOS is a financial operating system designed for serious retail investors, focused on delivering reliable market intelligence, portfolio insights, and real-time decision support through a modern, performance-first architecture.

We welcome contributions of all sizes, including:

* Bug fixes
* Performance improvements
* Documentation updates
* UI/UX enhancements
* Testing improvements
* New features aligned with the project's vision

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

* Node.js 18+
* npm or pnpm
* Git

### Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/stockos.git
cd stockos
```

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

---

## Development Guidelines

### Branch Naming

Use descriptive branch names:

```text
feature/market-dashboard
feature/portfolio-insights
fix/cache-sync-issue
docs/readme-improvements
```

### Commit Messages

Follow conventional commit style where possible:

```text
feat: add portfolio allocation widget
fix: resolve market state synchronization bug
docs: improve setup instructions
test: add MarketStatusEngine unit tests
refactor: simplify cache initialization logic
```

---

## Code Standards

### TypeScript

* Prefer strict typing.
* Avoid `any` unless absolutely necessary.
* Use clear interface and type definitions.

### React & Next.js

* Keep components focused and reusable.
* Extract complex logic into hooks or services.
* Avoid unnecessary re-renders.

### Performance First

StockOS is designed around responsiveness and reliability.

When contributing:

* Minimize network requests.
* Prefer cached data when appropriate.
* Consider rendering performance.
* Avoid introducing unnecessary dependencies.

---

## Testing

Please include tests whenever practical.

Run tests:

```bash
npm test
```

Before submitting a pull request:

```bash
npm run lint
npm run test
npm run build
```

Ensure all checks pass successfully.

---

## Documentation

If your contribution introduces:

* New features
* Architectural changes
* New configuration options

Please update the relevant documentation.

Good documentation is considered a valuable contribution.

---

## Pull Request Process

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Add or update tests when applicable.
5. Ensure the project builds successfully.
6. Submit a Pull Request with a clear description.

Please include:

* What changed
* Why it changed
* Screenshots (if UI related)
* Any migration or setup considerations

---

## Reporting Issues

When opening an issue, please include:

### Bug Reports

* Expected behavior
* Actual behavior
* Steps to reproduce
* Environment details
* Screenshots or logs if available

### Feature Requests

* Problem being solved
* Proposed solution
* Alternative approaches considered

---

## Project Vision

StockOS aims to provide a modern operating system for retail investing by combining:

* Real-time market intelligence
* Portfolio awareness
* Intelligent automation
* High-performance architecture
* Exceptional user experience

Contributions that improve clarity, reliability, performance, and investor value are especially appreciated.

---

## Code of Conduct

Be respectful, constructive, and professional.

We value thoughtful discussion, evidence-based decision making, and a collaborative environment where contributors can learn and grow.

Thank you for helping improve StockOS.
