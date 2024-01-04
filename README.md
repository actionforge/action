<!-- markdownlint-disable MD041 MD033 -->
![Actionforge Banner](https://www.actionforge.dev/assets/social.jpg?)

# Actionforge Action

<div align="center" width="100%">

[![view-action-graph](https://img.shields.io/github/actions/workflow/status/actionforge/action/build-and-publish.yml?label=View%20Action%20Graph)](https://www.actionforge.dev/github/actionforge/action/main/.github/workflows/graphs/build-and-publish.yml)
[![made-with-ts](https://img.shields.io/badge/Made%20with-TS-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-ACL-blue?color=orange)](https://www.github.com/actionforge/legal/blob/main/LICENSE.md)

</div>

Welcome to the Actionforge Action source code!

Actionforge introduces Action Graphs, a faster and easier way to create and execute GitHub workflows. This new approach replaces tedious YAML file editing by hand with a user-friendly graph editor. Action Graphs are compatible with GitHub Actions. The core product consists out of 4 components:

- ♾️ [VS Code Extension](https://www.github.com/actionforge/vscode-ext) - Extension to modify Action Graphs within VS Code.
- 🟢 [GitHub Action](https://www.github.com/actionforge/action) - GitHub Action that reads the Action Graph and starts the Graph Runner with it.
- 🏃‍♀️ [Graph Runner](https://www.github.com/actionforge/graph-runner) - The cli program that executes an Action Graph.
- 🕸️ [Graph Editor](https://www.github.com/actionforge/graph-editor) - Visual graph editor to create and build Action Graphs. These graphs will be committed to your repository.

For a full introduction check out the [Actionforge Documentation](https://www.actionforge.dev/docs).

## Usage

<!-- start usage -->
```yaml
- uses: actionforge/action@v0.8.30
  with:
    # The name of the graph file located in the `.github/workflows/graphs` directory.
    # This file defines the Actionforge Action Graph to be executed.
    graph_file: ''

    # A Personal Access Token (PAT) used for authentication. 
    # If not provided, the default GitHub token for the repository will be used.
    # Default: ${{ github.token }}
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    token: ''
```

For examples check out the [Actionforge Examples](https://www.github.com/actionforge/examples) 🔗 repository.

## License

This SOFTWARE is licensed under the Actionforge Community License that you can find [here](https://github.com/actionforge/legal/blob/main/LICENSE.md).

Licenses for commercial use will soon be available on the GitHub Marketplace.

For further information [Get in touch](mailto:hello@actionforge.dev).
