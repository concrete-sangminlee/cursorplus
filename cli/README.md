# Orion CLI

Command-line interface for the Orion IDE.

## Quick Start

```bash
npm run cli:build && npx orion chat
```

## Available Commands

| Command          | Description                                  |
| ---------------- | -------------------------------------------- |
| `orion chat`     | Start an interactive AI chat session         |
| `orion ask`      | Ask a one-off question and get a response    |
| `orion init`     | Initialize Orion configuration in a project  |
| `orion config`   | View or update CLI configuration             |
| `orion status`   | Show current project and session status      |
| `orion help`     | Display help information for any command     |

## Configuration

Orion CLI reads configuration from the following locations (in order of precedence):

1. **Command-line flags** -- passed directly to any command (e.g., `--model gpt-4`).
2. **Project config** -- `.orion/config.json` in the current working directory.
3. **Global config** -- `~/.orion/config.json` in your home directory.

### Key options

| Option          | Description                          | Default          |
| --------------- | ------------------------------------ | ---------------- |
| `model`         | AI model to use                      | `gpt-4`          |
| `temperature`   | Sampling temperature (0-1)           | `0.7`            |
| `maxTokens`     | Maximum tokens per response          | `4096`           |
| `stream`        | Enable streaming output              | `true`           |
| `contextLines`  | Lines of context sent with queries   | `50`             |

Set any option via the `config` command:

```bash
orion config set model gpt-4
orion config set temperature 0.5
orion config get model
```

## Examples

### Interactive chat session

```bash
orion chat
```

### Ask a single question

```bash
orion ask "How do I refactor this function?"
```

### Ask with a file as context

```bash
orion ask --file src/utils.ts "Add error handling to this module"
```

### Initialize a project

```bash
cd my-project
orion init
```

### Override model for a single request

```bash
orion ask --model gpt-4 "Explain this code"
```
