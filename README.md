<!-- markdownlint-disable MD041 MD033 -->
# Actionforge Action

<div align="center" width="100%">

[![view-action-graph](https://img.shields.io/github/actions/workflow/status/actionforge/action/build-and-publish.yml?label=View%20Action%20Graph)](https://app.actionforge.dev/github/actionforge/action/main/.github/workflows/graphs/build-and-publish.act)
[![made-with-ts](https://img.shields.io/badge/Made%20with-TS-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-ACL-blue?color=orange)](https://www.github.com/actionforge/legal/blob/main/LICENSE.md)

</div>

Welcome to the Actionforge Action source code!

Actionforge introduces Action Graphs, a faster and easier way to create and execute GitHub workflows. This new approach replaces tedious YAML file editing by hand with a user-friendly graph editor. Action Graphs are compatible with GitHub Actions. The core product consists out of 3 components:

- 🟢 [GitHub Action](https://www.github.com/actionforge/action) - GitHub Action that reads the Action Graph and starts the Graph Runner with it.
- 🏃‍♀️ [Actrun](https://www.github.com/actionforge/graph-runner) - The cli program that executes an Action Graph.
- 🕸️ [Web App](https://app.actionforge.dev) - Visual graph editor to create and build Action Graphs. These graphs will be committed to your repository.

For a full introduction check out the [Actionforge Documentation](http://docs.actionforge.dev).

## Usage

```yaml
- uses: actionforge/action@v0.14.5
  with:
    # The name of the graph file located in the `.github/workflows/graphs` directory.
    # This file defines the Actionforge Action Graph to be executed.
    graph_file: 'your_graph.act'

    # A Personal Access Token (PAT) used for authentication. 
    # If not provided, the default GitHub token for the repository will be used.
    # Default: ${{ github.token }}
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    github_token: ''
```

## License

This SOFTWARE is licensed under the [Actionforge EULA](https://github.com/actionforge/legal/blob/main/LICENSE.md).

For further information [Get in touch](mailto:hello@actionforge.dev).
