using System;
using System.Collections.Generic;
using System.ComponentModel.Composition;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Workspace;
using Microsoft.VisualStudio.Workspace.Settings;
using Microsoft.VisualStudio.Workspace.VSIntegration.Contracts;
using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Threading;
using Microsoft.VisualStudio.Utilities;
using Task = System.Threading.Tasks.Task;
using System.Linq;

namespace Microsoft.Cadl.VisualStudio
{
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [Guid("88b9492f-c019-492c-8aeb-f325a7e4cf23")]
    public sealed class Package : AsyncPackage { }

    public sealed class ContentDefinition
    {
        [Export]
        [Name("cadl")]
        [BaseDefinition(CodeRemoteContentDefinition.CodeRemoteContentTypeName)]
        public ContentTypeDefinition? CadlContentTypeDefinition => null;

        [Export]
        [FileExtension(".cadl")]
        [ContentType("cadl")]
        public FileExtensionToContentTypeDefinition? CadlFileExtensionDefinition => null;
    }

    [Export(typeof(ILanguageClient))]
    [ContentType("cadl")]
    public sealed class LanguageClient : ILanguageClient
    {

        public string Name => "Cadl";
        public IEnumerable<string>? ConfigurationSections { get; } = new[] { "cadl" };

        public object? InitializationOptions => null;
        public bool ShowNotificationOnInitializeFailed => true;
        public IEnumerable<string> FilesToWatch { get; } = new[] { "**/*.cadl", "**/cadl-project.yaml", "**/package.json" };
        public event AsyncEventHandler<EventArgs>? StartAsync;
        public event AsyncEventHandler<EventArgs>? StopAsync { add { } remove { } } // unused

        private readonly IVsFolderWorkspaceService workspaceService;

        [ImportingConstructor]
        public LanguageClient([Import] IVsFolderWorkspaceService workspaceService)
        {
            this.workspaceService = workspaceService;
        }

        public async Task<Connection?> ActivateAsync(CancellationToken token)
        {
            await Task.Yield();

            var workspace = workspaceService.CurrentWorkspace;
            var settingsManager = workspace?.GetSettingsManager();
            var settings = settingsManager?.GetAggregatedSettings(SettingsTypes.Generic);
            var options = Environment.GetEnvironmentVariable("CADL_SERVER_NODE_OPTIONS");
            var (serverCommand, serverArgs) = resolveCadlServer(settings);
            var info = new ProcessStartInfo
            {
                // Use cadl-server on PATH in production
                FileName = serverCommand,
                Arguments = string.Join(" ", serverArgs),
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                Environment = { new("NODE_OPTIONS", options) },
                WorkingDirectory = settings?.ScopePath,
            };

#if DEBUG
      // Use local build of cadl-server in development (lauched from F5 in VS)
      if (InDevelopmentMode()) {
        // --nolazy isn't supported by NODE_OPTIONS so we pass these via CLI instead
        info.Environment.Remove("NODE_OPTIONS");
      }
#endif

            var process = Process.Start(info);
            process.BeginErrorReadLine();
            process.ErrorDataReceived += (_, e) => LogStderrMessage(e.Data);

            return new Connection(
              process.StandardOutput.BaseStream,
              process.StandardInput.BaseStream);
        }

        public async Task OnLoadedAsync()
        {
            var start = StartAsync;
            if (start is not null)
            {
                await start.InvokeAsync(this, EventArgs.Empty);
            }
        }

#if VS2019
    public Task OnServerInitializeFailedAsync(Exception e) {
      Debug.Fail("Failed to initialize cadl-server:\r\n\r\n" + e);
      return Task.CompletedTask;
    }
#endif

#if VS2022
    public Task<InitializationFailureContext?> OnServerInitializeFailedAsync(ILanguageClientInitializationInfo initializationState) {
      var exception = initializationState.InitializationException;
      Debug.Fail("Failed to initialize cadl-server:\r\n\r\n" + exception);
      return Task.FromResult<InitializationFailureContext?>(
        new InitializationFailureContext {
          FailureMessage = "Failed to activate Cadl language server!\r\n" +
                           "File issue at https://github.com/microsoft/cadl\r\n\r\n" +
                           exception
      });
    }
#endif

        public Task OnServerInitializedAsync()
        {
            return Task.CompletedTask;
        }

        private void LogStderrMessage(string? message)
        {
            if (message is null || message.Length == 0)
            {
                return;
            }

            Debugger.Log(0, null, "cadl-server (stderr): " + message);
        }

#if DEBUG
    private static bool InDevelopmentMode() {
      return string.Equals(
        Environment.GetEnvironmentVariable("CADL_DEVELOPMENT_MODE"),
        "true",
        StringComparison.OrdinalIgnoreCase);
    }

    private static string GetDevelopmentCadlServerPath() {
      // Even when debugging, we get deployed to an extension folder outside the
      // source tree, so we stash the source directory in a file in debug builds
      // so we can use it to run cadl-server against the live developer build in
      // the source tree.
      var thisDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
      var srcDir = File.ReadAllText(Path.Combine(thisDir, "DebugSourceDirectory.txt")).Trim();
      return Path.GetFullPath(Path.Combine(srcDir, "../compiler/cmd/cadl-server.js"));
    }
#endif

        private (string, string[]) resolveCadlServer(IWorkspaceSettings? settings)
        {
            var args = new string[] { "--stdio" };

#if DEBUG
      // Use local build of cadl-server in development (lauched from F5 in VS)
      if (InDevelopmentMode()) {
        var options = Environment.GetEnvironmentVariable("CADL_SERVER_NODE_OPTIONS");
        var module = GetDevelopmentCadlServerPath();
        return ("node.exe", new string[] { module, options }.Concat(args).ToArray());
      }
#endif

            var serverPath = settings?.Property<string>("cadl.cadl-server.path");
            if (serverPath == null)
            {
                return ("cadl-server.cmd", args);
            }

            if (!serverPath.EndsWith(".js"))
            {
                if (File.Exists(serverPath))
                {
                    var command = serverPath.EndsWith(".cmd") ? serverPath : $"${serverPath}.cmd";
                    return (command, args);
                }
                else
                {
                    serverPath = Path.Combine(serverPath, "cmd/cadl-server.js");
                }
            }
            return ("node.exe", new string[] { serverPath }.Concat(args).ToArray());

        }
    }
}

