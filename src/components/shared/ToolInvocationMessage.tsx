import { Loader2, Check } from "lucide-react";
import HtmlPreview from "@/components/shared/HtmlPreview";

export interface ToolInvocation {
  state: "partial-call" | "call" | "result";
  step: number;
  toolCallId: string;
  toolName: string;
  args?: {
    id?: string;
    url?: string;
    year?: string;
    html?: string;
    [key: string]: unknown;
  };
  result?: unknown;
}

export interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
}

interface ToolInvocationMessageProps {
  part: ToolInvocationPart;
  partKey: string;
  isLoading: boolean;
  getAppName: (id?: string) => string;
  formatToolName: (name: string) => string;
  setIsInteractingWithPreview: (val: boolean) => void;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}

export function ToolInvocationMessage({
  part,
  partKey,
  getAppName,
  formatToolName,
  setIsInteractingWithPreview,
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
}: ToolInvocationMessageProps) {
  const { toolInvocation } = part;
  const { toolName, state, args, result } = toolInvocation;

  // Friendly display strings
  let displayCallMessage: string | null = null;
  let displayResultMessage: string | null = null;

  if (state === "call" || state === "partial-call") {
    switch (toolName) {
      case "textEditSearchReplace":
        displayCallMessage = "Replacing text…";
        break;
      case "textEditInsertText":
        displayCallMessage = "Inserting text…";
        break;
      case "launchApp":
        displayCallMessage = `Launching ${getAppName(args?.id)}…`;
        break;
      case "closeApp":
        displayCallMessage = `Closing ${getAppName(args?.id)}…`;
        break;
      case "textEditNewFile":
        displayCallMessage = "Creating new document…";
        break;
      default:
        displayCallMessage = `Running ${formatToolName(toolName)}…`;
    }
  }

  if (state === "result") {
    if (toolName === "launchApp" && args?.id === "internet-explorer") {
      const urlPart = args.url ? ` ${args.url}` : "";
      const yearPart = args.year && args.year !== "" ? ` in ${args.year}` : "";
      displayResultMessage = `Launched${urlPart}${yearPart}`;
    } else if (toolName === "launchApp") {
      displayResultMessage = `Launched ${getAppName(args?.id)}`;
    } else if (toolName === "closeApp") {
      displayResultMessage = `Closed ${getAppName(args?.id)}`;
    }
  }

  // Special handling for generateHtml
  if (state === "result" && toolName === "generateHtml" && typeof result === "string" && result.trim().length > 0) {
    return (
      <HtmlPreview
        key={partKey}
        htmlContent={result}
        onInteractionChange={setIsInteractingWithPreview}
        playElevatorMusic={playElevatorMusic}
        stopElevatorMusic={stopElevatorMusic}
        playDingSound={playDingSound}
        className="my-1"
      />
    );
  }

  if (toolName === "generateHtml") {
    if (state === "partial-call") {
      return (
        <div key={partKey} className="mb-0.5 p-1.5 bg-white/50 rounded text-xs italic text-gray-600 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
          <span className="shimmer">Generating...</span>
        </div>
      );
    } else if (state === "call") {
      const htmlContent = typeof args?.html === "string" ? args.html : "";
      if (htmlContent) {
        return (
          <HtmlPreview
            key={partKey}
            htmlContent={htmlContent}
            isStreaming={false}
            onInteractionChange={setIsInteractingWithPreview}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
            className="my-1"
          />
        );
      }
      return (
        <div key={partKey} className="mb-0.5 p-1.5 bg-white/50 rounded text-xs italic text-gray-500">
          Preparing HTML preview...
        </div>
      );
    }
  }

  // Default rendering for other tools
  return (
    <div key={partKey} className="mb-0.5 p-1.5 bg-white/50 rounded text italic text-[12px]">
      {(state === "call" || state === "partial-call") && (
          <div className="flex items-center gap-1 text-gray-700">
          <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
          {displayCallMessage ? (
            <span className="shimmer">{displayCallMessage}</span>
          ) : (
            <span>
              Calling <strong>{formatToolName(toolName)}</strong>…
            </span>
          )}
        </div>
      )}
      {state === "result" && (
        <div className="flex items-center gap-1 text-gray-700">
          <Check className="h-3 w-3 text-blue-600" />
          {displayResultMessage ? (
            <span>{displayResultMessage}</span>
          ) : (
            <div className="flex flex-col">
              {typeof result === "string" && result.length > 0 ? (
                <span className="text-gray-500">{result}</span>
              ) : (
                <span>{formatToolName(toolName)}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 