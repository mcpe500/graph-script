# Contributing to GraphScript

Thank you for your interest in contributing to GraphScript! Every contribution is greatly appreciated.

## How to Contribute

### 1. Report Bugs

- Open an [Issue](https://github.com/mcpe500/graph-script/issues) on GitHub
- Describe the steps to reproduce the bug
- Include your Node.js version and OS

### 2. Request Features

- Open an Issue with the `enhancement` label
- Describe the use case and benefits
- Discuss with maintainers before starting work

### 3. Submit Pull Requests

1. Fork the repository
2. Create a new branch from `main`:
   ```bash
   git checkout -b feature/new-feature
   ```
3. Make your changes
4. Ensure all tests pass:
   ```bash
   npm run guard:quality
   ```
5. Commit with a clear message:
   ```bash
   git commit -m "feat: add feature X"
   ```
6. Push to your branch:
   ```bash
   git push origin feature/new-feature
   ```
7. Open a Pull Request to `main`

## Code Guidelines

### Style

- Use 2-space indentation
- Follow TypeScript conventions
- Add JSDoc comments for public APIs
- Keep files under 300 lines (split into modules)

### Testing

- Write tests for every new feature
- Ensure existing tests are not broken
- Run `npm test` before committing

### Commit Messages

Use the following format:

```
type: short description

Optional details about the change.
```

Available types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic changes)
- `refactor`: Code refactoring
- `test`: Adding or fixing tests
- `chore`: Build or tooling changes

## Areas for Contribution

Here are areas that need help:

- [ ] Additional chart types (box plot, violin, etc.)
- [ ] More infrastructure providers (GCP, Azure)
- [ ] Interactive HTML renderer
- [ ] VS Code extension
- [ ] Language Server Protocol (LSP)
- [ ] Additional export formats (PDF, GLB)
- [ ] Performance optimizations
- [ ] Documentation and examples

## Questions?

If you have questions, open a [Discussion](https://github.com/mcpe500/graph-script/discussions) on GitHub.

---

Thank you for contributing!
