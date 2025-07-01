import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { Maximize, Minimize, Copy, Check, Save, Code, GripVertical, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import * as shiki from "shiki";
import {
  loadHtmlPreviewSplit,
  saveHtmlPreviewSplit,
} from "@/stores/useAppStore";
import { useSound, Sounds } from "../../hooks/useSound";
import { useAppStore } from "@/stores/useAppStore";

// Create a singleton highlighter instance
let highlighterPromise: Promise<shiki.Highlighter> | null = null;

const getHighlighterInstance = () => {
  if (!highlighterPromise) {
    highlighterPromise = shiki.createHighlighter({
      themes: ["github-dark"],
      langs: ["html"],
    });
  }
  return highlighterPromise;
};

// Check if a string is a HTML code block
export const isHtmlCodeBlock = (
  text: string
): { isHtml: boolean; content: string } => {
  // Check for markdown code blocks with html tag
  const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/;
  const match = text.match(codeBlockRegex);

  if (match && match[1]) {
    const content = match[1].trim();
    // Check if content appears to be HTML (starts with a tag or has HTML elements)
    if (content.startsWith("<") || /<\/?[a-z][\s\S]*>/i.test(content)) {
      return { isHtml: true, content };
    }
  }

  // Also check for HTML content outside of code blocks
  const trimmedText = text.trim();
  if (
    trimmedText.startsWith("<") &&
    (/<\/[a-z][^>]*>/i.test(trimmedText) || // Has a closing tag
      /<[a-z][^>]*\/>/i.test(trimmedText) || // Has a self-closing tag
      trimmedText.includes("<style>") ||
      trimmedText.includes("<div>") ||
      trimmedText.includes("<span>"))
  ) {
    return { isHtml: true, content: trimmedText };
  }

  return { isHtml: false, content: "" };
};

// Extract HTML content even if the code block is incomplete/being streamed
export const extractHtmlContent = (
  text: string
): {
  htmlContent: string;
  textContent: string;
  hasHtml: boolean;
} => {
  // Check for complete HTML code blocks
  const completeRegex = /```(?:html)?\s*([\s\S]*?)```/g;
  let processedText = text;
  const htmlParts: string[] = [];
  let match;
  let hasHtml = false;

  // First check for complete HTML blocks
  while ((match = completeRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (
      content &&
      (content.startsWith("<") || /<\/?[a-z][\s\S]*>/i.test(content))
    ) {
      htmlParts.push(content);
      hasHtml = true;
      // Remove complete HTML blocks from text
      processedText = processedText.replace(match[0], "");
    }
  }

  // Then check for incomplete HTML blocks that are still streaming
  const incompleteRegex = /```(?:html)?\s*([\s\S]*?)$/;
  const incompleteMatch = processedText.match(incompleteRegex);

  if (
    incompleteMatch &&
    incompleteMatch[1] &&
    (incompleteMatch[1].trim().startsWith("<") ||
      /<\/?[a-z][\s\S]*>/i.test(incompleteMatch[1].trim()))
  ) {
    htmlParts.push(incompleteMatch[1].trim());
    hasHtml = true;
    // Remove incomplete HTML block from text
    processedText = processedText.replace(incompleteMatch[0], "");
  }

  // Check for standalone HTML content outside of code blocks
  const trimmedText = processedText.trim();
  if (
    !hasHtml &&
    trimmedText.startsWith("<") &&
    (/<\/[a-z][^>]*>/i.test(trimmedText) || // Has a closing tag
      /<[a-z][^>]*\/>/i.test(trimmedText) || // Has a self-closing tag
      trimmedText.includes("<style>") ||
      trimmedText.includes("<div>") ||
      trimmedText.includes("<span>"))
  ) {
    htmlParts.push(trimmedText);
    hasHtml = true;
    processedText = "";
  }

  // Join all HTML parts
  const htmlContent = htmlParts.join("\n\n");

  return {
    htmlContent,
    textContent: processedText,
    hasHtml,
  };
};

// Component to render ryOS Code Previews
interface HtmlPreviewProps {
  htmlContent: string;
  onInteractionChange?: (isInteracting: boolean) => void;
  isStreaming?: boolean;
  maxHeight?: number | string;
  minHeight?: number | string;
  initialFullScreen?: boolean;
  className?: string;
  playElevatorMusic?: (mode?: "past" | "future" | "now") => void;
  stopElevatorMusic?: () => void;
  playDingSound?: () => void;
  maximizeSound?: { play: () => void };
  minimizeSound?: { play: () => void };
  isInternetExplorer?: boolean;
  baseUrlForAiContent?: string;
  mode?: "past" | "future" | "now";
}

export default function HtmlPreview({
  htmlContent,
  onInteractionChange,
  isStreaming = false,
  maxHeight = "800px",
  minHeight = "200px",
  initialFullScreen = false,
  className = "",
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
  maximizeSound: propMaximizeSound,
  minimizeSound: propMinimizeSound,
  isInternetExplorer = false,
  baseUrlForAiContent,
  mode = "now",
}: HtmlPreviewProps) {
  const [isFullScreen, setIsFullScreen] = useState(initialFullScreen);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [isSplitView, setIsSplitView] = useState(loadHtmlPreviewSplit());
  const [highlightedCode, setHighlightedCode] = useState("");
  const [originalHeight, setOriginalHeight] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const wasDragging = useRef(false);
  const lastDragEndTime = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const iframeId = useRef(
    `iframe-${Math.random().toString(36).substring(2, 9)}`
  ).current;
  const prevStreamingRef = useRef(isStreaming);
  const contentTimestamp = useRef(Date.now());
  const dragControls = useDragControls();
  // Ref to store the final processed HTML content after streaming
  const finalProcessedHtmlRef = useRef<string | null>(null);
  const [streamPreviewHtml, setStreamPreviewHtml] = useState<string>(""); // NEW state to hold live HTML preview during streaming
  const lastStreamRenderRef = useRef<number>(0); // To throttle updates
  const terminalSoundsEnabled = useAppStore(state => state.terminalSoundsEnabled);

  // Ensure base URL has a protocol
  const normalizedBaseUrl = baseUrlForAiContent
    ? baseUrlForAiContent.startsWith("http")
      ? baseUrlForAiContent
      : `https://${baseUrlForAiContent}`
    : null;

  // Add sound hooks - fallback to local sound hooks if props not provided
  const localMaximizeSound = useSound(Sounds.WINDOW_EXPAND);
  const localMinimizeSound = useSound(Sounds.WINDOW_COLLAPSE);
  
  // Use prop sounds if provided, otherwise use local sounds
  const maximizeSound = propMaximizeSound || localMaximizeSound;
  const minimizeSound = propMinimizeSound || localMinimizeSound;

  // Save split view state when it changes
  useEffect(() => {
    saveHtmlPreviewSplit(isSplitView);
  }, [isSplitView]);

  // Capture the original height when toggling fullscreen
  useEffect(() => {
    if (isFullScreen && previewRef.current && !originalHeight) {
      // Store the current height of the element before going fullscreen
      const height = `${previewRef.current.offsetHeight}px`;
      setOriginalHeight(height);
    }
  }, [isFullScreen, originalHeight]);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Listen for ESC key to exit fullscreen
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        minimizeSound.play();
        setIsFullScreen(false);
      }
    };

    if (isFullScreen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isFullScreen, minimizeSound]);

  // Enhanced processedHtmlContent with timestamp to force fresh execution
  const processedHtmlContent = (() => {
    const timestamp = `<!-- ts=${contentTimestamp.current} -->`;
    const baseTag = normalizedBaseUrl ? `<base href="${normalizedBaseUrl}">` : '';

    // Define the script tags and styles that should be added ONLY after streaming
    // Font link MUST be first for potentially faster loading/application
    const postStreamHeadContent = `
  <link rel="stylesheet" href="/fonts/fonts.css">
  ${timestamp} 
  ${baseTag}
  <script type="module" src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.174.0/three.module.min.js"></script>
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Geneva-12", "ArkPixel", "SerenityOS-Emoji", "sans-serif"],
            mono: ["Monaco", "ArkPixel", "SerenityOS-Emoji", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
            serif: ["Mondwest", "Yu Mincho", "Hiragino Mincho Pro", "Georgia", "Palatino", "SerenityOS-Emoji", "serif"],
            emoji: ["SerenityOS-Emoji", "AppleColorEmoji", "AppleColorEmojiFallback"],
            'geneva': ["Geneva-12", "ArkPixel", "SerenityOS-Emoji", "system-ui", "-apple-system", "sans-serif"],
            'mondwest': ["Mondwest", "Yu Mincho", "Hiragino Mincho Pro", "Georgia", "Palatino", "Yu Mincho", "Hiragino Mincho Pro", "serif"],
            'neuebit': ["NeueBit", "ArkPixel", "SerenityOS-Emoji", "Helvetica", "Arial", "Hiragino Sans", "sans-serif"],
            'monaco': ["Monaco", "ArkPixel", "SerenityOS-Emoji", "monospace"],
            'jacquard': ["Jacquard", "Yu Mincho", "Hiragino Mincho Pro", "Georgia", "Palatino", "serif"]
          }
        }
      }
    }
  </script>
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      overflow-x: auto; /* Allow horizontal scroll if content overflows */
      width: 100%;
      height: 100%;
      max-width: 100%; /* Prevent body from exceeding viewport width */
    }
    /* Ensure pre doesn't break layout */
    pre {
      white-space: pre-wrap; /* Allow wrapping */
      word-break: break-all; /* Break long words */
    }
  </style>
  
  <!-- Move click interceptor script to head for earlier execution -->
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      document.addEventListener('click', function(event) {
        var targetElement = event.target.closest('a');
        // Only intercept if it's a valid link and NOT inside the draggable toolbar
        if (targetElement && targetElement.href && !targetElement.closest('[data-drag-controls]')) {
          event.preventDefault();
          event.stopPropagation();
          try {
            // Resolve relative URLs against the document's base URI (if set) or window location
            const absoluteUrl = new URL(targetElement.getAttribute('href'), document.baseURI || window.location.href).href;
            // Use a specific message type for AI HTML navigation
            window.parent.postMessage({ type: 'aiHtmlNavigation', url: absoluteUrl }, '*');
            console.log('Intercepted link click:', absoluteUrl);
          } catch (e) { console.error("Error resolving/posting URL:", e); }
        }
      }, true); // Use capture phase to intercept early
    });
    
    // Also add immediate execution version for documents that load quickly
    // This helps ensure we don't miss any clicks during initial page load
    (function() {
      document.addEventListener('click', function(event) {
        var targetElement = event.target.closest('a');
        // Only intercept if it's a valid link and NOT inside the draggable toolbar
        if (targetElement && targetElement.href && !targetElement.closest('[data-drag-controls]')) {
          event.preventDefault();
          event.stopPropagation();
          try {
            // Resolve relative URLs against the document's base URI (if set) or window location
            const absoluteUrl = new URL(targetElement.getAttribute('href'), document.baseURI || window.location.href).href;
            // Use a specific message type for AI HTML navigation
            window.parent.postMessage({ type: 'aiHtmlNavigation', url: absoluteUrl }, '*');
            console.log('Intercepted link click (immediate handler):', absoluteUrl);
          } catch (e) { console.error("Error resolving/posting URL:", e); }
        }
      }, true); // Use capture phase to intercept early
    })();
  </script>
`;

    // --- Start modification: Extract core HTML content ---
    const trimmedHtmlContent = htmlContent.trim();
    let coreHtmlContent = trimmedHtmlContent; // Default to use trimmed content

    // NEW: First, strip potential markdown code block fence
    if (coreHtmlContent.startsWith('```html')) {
      coreHtmlContent = coreHtmlContent.substring('```html'.length).trim();
    } else if (coreHtmlContent.startsWith('```')) {
      coreHtmlContent = coreHtmlContent.substring('```'.length).trim();
    }

    // Remove trailing ``` if present
    if (coreHtmlContent.endsWith('```')) {
        coreHtmlContent = coreHtmlContent.substring(0, coreHtmlContent.length - '```'.length).trim();
    }

    // NEW: Strip leading text before the first tag '<'
    const firstTagIndex = coreHtmlContent.indexOf('<');
    if (firstTagIndex > 0) {
      // If '<' is found and it's not the first character, strip the leading text
      coreHtmlContent = coreHtmlContent.substring(firstTagIndex);
    } else if (firstTagIndex === -1) {
      // If no '<' is found at all, the content is likely just text, clear it or handle as needed
      // For now, let's assume we want to render nothing if there's no HTML tag.
      coreHtmlContent = ''; 
    }
    // If firstTagIndex is 0, it already starts with a tag, no stripping needed.

    // Now, check for and extract content within <html> tags
    const htmlStartIndex = coreHtmlContent.toLowerCase().indexOf('<html');
    const htmlEndIndex = coreHtmlContent.toLowerCase().lastIndexOf('</html>');

    if (htmlStartIndex !== -1) {
        // Found <html> tag
        if (htmlEndIndex > htmlStartIndex) {
            // Found both <html> and </html>, extract the content between them (inclusive)
            coreHtmlContent = coreHtmlContent.substring(htmlStartIndex, htmlEndIndex + '</html>'.length);
        } else {
            // Found <html> but no </html> after it, take content from <html> to the end
            coreHtmlContent = coreHtmlContent.substring(htmlStartIndex);
        }
    }
    // If no <html> tag, coreHtmlContent remains the original trimmedHtmlContent (fragment)
    // --- End modification ---

    // Use coreHtmlContent for subsequent checks and processing
    const isFullHtmlDoc = /<!DOCTYPE html>/i.test(coreHtmlContent) || /<html[\s>]/i.test(coreHtmlContent);

    if (isFullHtmlDoc) {
        let modifiedContent = coreHtmlContent; // Start with the potentially extracted content

        // Attempt to inject into <head>
        const headEndMatch = /<\/head>/i.exec(modifiedContent);
        if (headEndMatch) {
            // Inject just before closing </head> tag
            modifiedContent = modifiedContent.slice(0, headEndMatch.index) + postStreamHeadContent + modifiedContent.slice(headEndMatch.index);
        } else {
            // No </head>, try injecting after <head> or <html>, or prepend a new head
            const headStartMatch = /<head[^>]*>/i.exec(modifiedContent);
            if (headStartMatch) {
                 modifiedContent = modifiedContent.slice(0, headStartMatch.index + headStartMatch[0].length) + postStreamHeadContent + modifiedContent.slice(headStartMatch.index + headStartMatch[0].length);
            } else {
                const htmlStartMatch = /<html[^>]*>/i.exec(modifiedContent);
                if (htmlStartMatch) {
                    // Inject head after opening <html> tag
                     modifiedContent = modifiedContent.slice(0, htmlStartMatch.index + htmlStartMatch[0].length) + `<head>${postStreamHeadContent}</head>` + modifiedContent.slice(htmlStartMatch.index + htmlStartMatch[0].length);
                } else {
                    // Prepend head if no <html> tag found (very unlikely, might be invalid HTML)
                    modifiedContent = `<head>${postStreamHeadContent}</head>` + modifiedContent;
                }
            }
        }

        // We no longer need to inject the click interceptor script since it's already in the head
        // Just return the modified content
        return modifiedContent;

    } else {
      // Construct the document for partial HTML fragments
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${postStreamHeadContent} 
</head>
<body>
  ${coreHtmlContent}
</body>
</html>`;
    }
  })();

  // Function to update iframe content (now only called after streaming)
  const updateIframeContent = (finalContent: string) => {
    requestAnimationFrame(() => {
      // Update inline iframe
      if (iframeRef.current) {
        iframeRef.current.srcdoc = finalContent;
      }

      // Update fullscreen iframe if it exists
      if (fullscreenIframeRef.current) {
        fullscreenIframeRef.current.srcdoc = finalContent;
      }
    });
  };

  // NEW: Effect to update iframe *after* streaming finishes or when content changes while not streaming
  useEffect(() => {
    if (!isStreaming) {
      // Generate the final content ONLY when needed
      const finalContent = processedHtmlContent;
      finalProcessedHtmlRef.current = finalContent; // Store for fullscreen/code view
      updateIframeContent(finalContent);
    }
    // Dependency: htmlContent ensures update if content changes *after* streaming
    // Dependency: isStreaming ensures update when streaming stops
  }, [isStreaming, htmlContent]);

  // Initialize syntax highlighting only when code view is active
  useEffect(() => {
    let isMounted = true;

    const highlight = async () => {
      try {
        const highlighter = await getHighlighterInstance();
        // Use the stored final HTML content for highlighting
        const contentToHighlight = finalProcessedHtmlRef.current || processedHtmlContent;
        if (isMounted && contentToHighlight) {
          const highlighted = highlighter.codeToHtml(contentToHighlight, {
            lang: "html",
            theme: "github-dark",
          });
          setHighlightedCode(highlighted);
        }
      } catch (error) {
        console.error("Failed to highlight code:", error);
      }
    };

    // Only initialize Shiki and highlight code when code view is active
    // Reset highlightedCode if showCode becomes false
    if (showCode) {
        if (!highlightedCode) {
            highlight();
        }
    } else {
        setHighlightedCode(""); // Clear when code view is hidden
    }

    return () => {
      isMounted = false;
    };
  }, [showCode, finalProcessedHtmlRef.current]); // Depend on showCode and the final content ref

  // Play music and cancel when unmounting for streaming content
  useEffect(() => {
    if (isStreaming && playElevatorMusic && terminalSoundsEnabled) {
      playElevatorMusic(mode);
      return () => {
        if (stopElevatorMusic) {
          stopElevatorMusic();
        }
      };
    }
  }, [isStreaming, playElevatorMusic, stopElevatorMusic, mode, terminalSoundsEnabled]);

  // Play a completion sound when streaming ends
  useEffect(() => {
    if (
      prevStreamingRef.current &&
      !isStreaming &&
      playDingSound &&
      stopElevatorMusic &&
      terminalSoundsEnabled
    ) {
      playDingSound();
      stopElevatorMusic();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, playDingSound, stopElevatorMusic, terminalSoundsEnabled]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopySuccess(true);

      // Reset after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const handleSaveToDisk = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([processedHtmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .substring(0, 19);
    a.href = url;
    a.download = `ryOS-generated-${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFullScreen) {
      maximizeSound.play();
      // Ensure content is updated when going fullscreen
      const finalContent = finalProcessedHtmlRef.current || processedHtmlContent;
      updateIframeContent(finalContent);
    } else {
      minimizeSound.play();
    }
    setIsFullScreen(!isFullScreen);
  };

  // Add effect to update fullscreen content when it changes
  useEffect(() => {
    if (isFullScreen && !isStreaming) {
      const finalContent = finalProcessedHtmlRef.current || processedHtmlContent;
      updateIframeContent(finalContent);
    }
  }, [isFullScreen, isStreaming, processedHtmlContent]);

  // Document-level mouse move handler
  const handleDocumentMouseMove = (e: MouseEvent) => {
    const deltaX = Math.abs(e.clientX - lastDragEndTime.current);
    const deltaY = Math.abs(e.clientY - lastDragEndTime.current);
    
    if (deltaX > 5 || deltaY > 5) {
      setIsDragging(true);
      wasDragging.current = true;
    }
  };
  
  // Document-level touch move handler
  const handleDocumentTouchMove = (e: TouchEvent) => {
    if (!e.touches[0]) return;
    
    const deltaX = Math.abs(e.touches[0].clientX - lastDragEndTime.current);
    const deltaY = Math.abs(e.touches[0].clientY - lastDragEndTime.current);
    
    if (deltaX > 5 || deltaY > 5) {
      wasDragging.current = true;
    }
  };
  
  // Document-level mouse up handler
  const handleDocumentMouseUp = () => {
    cleanup();
  };
  
  // Document-level touch end handler
  const handleDocumentTouchUp = () => {
    cleanup();
  };
  
  // Clean up all handlers
  const cleanup = () => {
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('touchmove', handleDocumentTouchMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    document.removeEventListener('touchend', handleDocumentTouchUp);
    
    // Reset dragging state after cooldown
    setTimeout(() => {
      setIsDragging(false);
    }, 150);
  };

  // Function to handle toolbar toggle
  const toggleToolbarCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isDragging) {
      setIsToolbarCollapsed(!isToolbarCollapsed);
      if (!isToolbarCollapsed) {
        minimizeSound.play();
      } else {
        maximizeSound.play();
      }
    }
  };
  
  // Handle direct click on plus icon (when collapsed)
  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToolbarCollapsed(false);
    maximizeSound.play();
  };

  // Function to sanitize HTML for stream preview - removing fixed position elements, scripts, styles, and link tags
  const sanitizeHtmlForStream = (html: string): string => {
    if (!html) return html;

    // Selectively filter style tags content instead of removing them completely
    let sanitized = html.replace(
  /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
  (_match, styleContent) => {
    // Filter out global font/color styles but keep other styles
    const filteredStyle = styleContent
      .replace(/(\s|^)(html|body|:root)\s*{[^}]*}/gi, '')    // Remove global element styles
      .replace(/font-family\s*:\s*[^;}]+(;|$)/gi, '')         // Remove font-family declarations
      .replace(/color\s*:\s*[^;}]+(;|$)/gi, '')               // Remove color declarations
      .replace(/\s*@font-face\s*{[^}]*}/gi, '');              // Remove @font-face blocks

    return `<style>${filteredStyle}</style>`;
  }
);

    // Remove all script tags and their contents
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove all link tags
    sanitized = sanitized.replace(/<link\b[^>]*>/gi, '');

    // Remove inline position:fixed styles
    sanitized = sanitized.replace(/position\s*:\s*fixed/gi, "position: relative");
    sanitized = sanitized.replace(/position\s*:\s*sticky/gi, "position: relative");
    
    // Handle Tailwind classes - convert fixed/sticky to relative
    const processTailwindClasses = (classStr: string): string => {
      const classes = classStr.split(/\s+/);
      return classes.map(cls => {
        // Replace standalone fixed/sticky classes
        if (cls === 'fixed') return 'relative';
        if (cls === 'sticky') return 'relative';
        
        // Remove specific positioning classes
        if (/^(top|bottom|left|right|inset)(-|$)/.test(cls)) return '';
        
        // Keep all other classes unchanged
        return cls;
      }).filter(Boolean).join(' ');
    };
    
    // Process standard HTML class attributes
    sanitized = sanitized.replace(/class="([^"]*)"/gi, (_match, classContent) => {
      return `class="${processTailwindClasses(classContent)}"`;
    });
    
    // Process React className attributes
    sanitized = sanitized.replace(/className="([^"]*)"/gi, (_match, classContent) => {
      return `className="${processTailwindClasses(classContent)}"`;
    });
    
    // Handle inline styles
    sanitized = sanitized.replace(/(position\s*:\s*relative.*?)(top|left|right|bottom)\s*:\s*[^;]+/gi, '$1$2: auto');
    
    // Handle z-index in fixed elements that were converted
    sanitized = sanitized.replace(/z-index\s*:\s*\d+/gi, 'z-index: auto');
    
    return sanitized;
  };

  // NEW Effect: Update stream preview HTML with throttling while streaming
  useEffect(() => {
    if (isStreaming) {
      const now = Date.now();
      // Throttle updates to once every 500ms
      if (now - lastStreamRenderRef.current > 500) {
        lastStreamRenderRef.current = now;
        const { htmlContent: extracted } = extractHtmlContent(htmlContent);
        
        // Don't sanitize or update if content hasn't meaningfully changed
        if (extracted && streamPreviewHtml !== extracted) {
          // Apply sanitization to remove fixed positioning before setting stream preview
          const sanitizedHtml = sanitizeHtmlForStream(extracted);
          setStreamPreviewHtml(sanitizedHtml);
        }
      }
    } else {
      // Reset when not streaming
      setStreamPreviewHtml("");
    }
  }, [htmlContent, isStreaming, streamPreviewHtml]);

  // Normal inline display with optional maximized height
  return (
    <>
      <motion.div
        ref={previewRef}
        className={`${isInternetExplorer ? '' : 'rounded'} bg-white overflow-auto m-0 relative ${className} ${isStreaming ? 'loading-pulse' : ''}`}
        style={{
          maxHeight: isInternetExplorer ? "100%" : (isFullScreen ? originalHeight || minHeight : maxHeight),
          // pointerEvents: isStreaming ? "none" : "auto", // Allow interaction with text stream potentially
          opacity: isFullScreen ? 0 : 1,
          height: isInternetExplorer ? "100%" : (isFullScreen ? originalHeight || minHeight : "auto"),
          boxShadow: isInternetExplorer ? "none" : (isFullScreen ? "none" : "0 0 0 1px rgba(0, 0, 0, 0.3)"),
          visibility: isFullScreen ? "hidden" : "visible",
          minHeight: minHeight, // Ensure minHeight is respected
        }}
        animate={{
          opacity: isFullScreen ? 0 : 1,
        }}
        transition={{
          opacity: {
            duration: 0.3,
            ease: "easeInOut",
          },
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => !isStreaming && onInteractionChange?.(true)}
        onMouseLeave={() => !isStreaming && onInteractionChange?.(false)}
        tabIndex={-1}
      >
        {/* Loading PULSE overlay (now breathing effect) */}
        {isStreaming && (
          <motion.div
            className="absolute inset-0 bg-gray-300 z-10 pointer-events-none"
            initial={{ opacity: 0.2 }} // Start at lower opacity
            animate={{
              opacity: [0.2, 0.6, 0.2] // Loop between 0.6 and 1
            }}
            transition={{
              duration: 3, // Slower duration for breathing effect
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        )}

        {!isInternetExplorer && (
          <motion.div
            className="flex justify-end p-1 absolute top-2 right-4 z-20"
            animate={{
              opacity: isStreaming ? 0 : 1, // Hide when streaming
            }}
            transition={{
              duration: 0.3,
            }}
            style={{
              pointerEvents: isStreaming ? "none" : "auto", // Disable interaction when streaming
            }}
          >
            <button
              onClick={handleSaveToDisk}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 hover:bg-black/10 rounded mr-1 group"
              aria-label="Save HTML to disk"
              disabled={isStreaming}
            >
              <Save
                size={16}
                className="text-neutral-400/50 group-hover:text-neutral-300"
              />
            </button>
            <button
              onClick={handleCopy}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 hover:bg-black/10 rounded mr-1 group"
              aria-label="Copy HTML code"
              disabled={isStreaming}
            >
              {copySuccess ? (
                <Check
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              ) : (
                <Copy
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              )}
            </button>
            <button
              onClick={toggleFullScreen}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 hover:bg-black/10 rounded group"
              aria-label={isFullScreen ? "Minimize preview" : "Maximize preview"}
              disabled={isStreaming}
            >
              {isFullScreen ? (
                <Minimize
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              ) : (
                <Maximize
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              )}
            </button>
          </motion.div>
        )}
        {/* Conditional Rendering: Text Stream or Iframe */}
        {isStreaming && htmlContent ? (
          <div
            className="h-full w-full relative overflow-auto"
            style={{
              maxHeight: isInternetExplorer ? "100%" : (typeof minHeight === "string" ? minHeight : `${minHeight}px`),
            }}
          >
            {streamPreviewHtml ? (
              <div
                className="generated-html-stream font-geneva-12"
                dangerouslySetInnerHTML={{ __html: streamPreviewHtml }}
              />
            ) : (
              <pre className="p-2 text-[12px] font-monaco antialiased text-gray-700 whitespace-pre-wrap break-words">
                {htmlContent.split('\n').slice(-8).join('\n')}
              </pre>
            )}
          </div>
        ) : (
          <motion.iframe
            ref={iframeRef}
            id={iframeId}
            // srcDoc is now set by useEffect after streaming finishes
            // srcDoc={processedHtmlContent()}
            title="ryOS Code Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
            style={{
              height: isInternetExplorer ? "100%" : (typeof minHeight === "string" ? minHeight : `${minHeight}px`),
              display: "block",
              // pointerEvents: isStreaming ? "none" : "auto", // Already handled by parent div conditional
              position: "relative",
              zIndex: 1,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      </motion.div>

      {/* Fullscreen overlay */}
      {createPortal(
        <AnimatePresence mode="wait">
          {isFullScreen && (
            <motion.div
              className="fixed inset-0 z-[9999] flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => {
                minimizeSound.play();
                setIsFullScreen(false);
              }}
            >
              <motion.div
                className="absolute inset-0 flex flex-col"
                initial={{
                  y: "15%",
                  opacity: 0
                }}
                animate={{
                  y: 0,
                  opacity: 1
                }}
                exit={{
                  y: "15%",
                  opacity: 0
                }}
                transition={{
                  type: "spring",
                  stiffness: 250,
                  damping: 25,
                }}
              >
                <div 
                  ref={fullscreenWrapperRef}
                  className="relative w-full h-full overflow-hidden"
                >
                  {/* Code view layer - always 100% width underneath */}
                  <AnimatePresence>
                    {showCode ? (
                      <motion.div
                        key="code"
                        className="absolute inset-0 bg-[#24292e] font-geneva-12 overflow-auto p-4 z-10"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: "12px" }}
                        dangerouslySetInnerHTML={{ __html: highlightedCode }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      />
                    ) : null}
                  </AnimatePresence>

                  {/* Preview iframe layer - positioned above code OR Text stream */}
                  <motion.div
                    className="absolute z-100 bg-white" // Added bg-white for text stream background
                    initial={false}
                    animate={{
                      width:
                        isSplitView && showCode
                          ? isMobile
                            ? "100%"
                            : "50%"
                          : "100%",
                      height:
                        isSplitView && showCode
                          ? isMobile
                            ? "50%"
                            : "100%"
                          : "100%",
                      right: 0,
                      opacity: showCode && !isSplitView ? 0 : 1,
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.25, 0.1, 0.25, 1.0],
                    }}
                    style={{
                      position: "absolute",
                      top: showCode && isSplitView && isMobile ? "50%" : 0,
                      right: 0,
                      overflow: "hidden", // Clip content
                    }}
                  >
                    {/* Fullscreen Conditional Rendering: Text Stream or Iframe */}
                    {isStreaming && htmlContent ? (
                      <motion.div
                        className="h-full w-full overflow-auto"
                        initial={{ opacity: 0.8, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                      >
                        {streamPreviewHtml ? (
                          <div
                            className="generated-html-stream font-geneva-12 text-sm p-4"
                            dangerouslySetInnerHTML={{ __html: streamPreviewHtml }}
                          />
                        ) : (
                          <pre className="p-4 text-xs font-geneva-12 text-gray-700 whitespace-pre-wrap break-words">
                            {htmlContent.split('\n').slice(-15).join('\n')}
                          </pre>
                        )}
                      </motion.div>
                    ) : (
                      <iframe
                        ref={fullscreenIframeRef}
                        id={`fullscreen-${iframeId}`}
                        // srcDoc is now set by useEffect after streaming finishes
                        // srcDoc={processedHtmlContent()}
                        title="ryOS Code Preview Fullscreen"
                        className="border-0 bg-white w-full h-full"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          pointerEvents: isDragging ? "none" : "auto",
                          ...(isInternetExplorer && { position: 'absolute', inset: 0 })
                        }}
                      />
                    )}

                    {/* Loading PULSE overlay for fullscreen (kept for visual feedback) */}
                    {isStreaming && htmlContent && (
                      <div
                        className="absolute inset-0 bg-gray-100 z-10 pointer-events-none"
                        style={{ opacity: 0.2 }}
                      >
                        <motion.div
                          className="w-full h-full bg-gray-400"
                          animate={{
                            opacity: [0.05, 0.2, 0.05]
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        />
                      </div>
                    )}
                  </motion.div>

                  {/* Toolbar - topmost layer */}
                  <motion.div 
                    ref={controlsRef}
                    className="absolute z-200"
                    initial={false}
                    drag
                    dragControls={dragControls}
                    dragConstraints={fullscreenWrapperRef}
                    dragElastic={0.2}
                    dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
                    dragSnapToOrigin={false}
                    whileDrag={{ scale: 1.05 }}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={() => {
                      // Set a short timeout to delay resetting isDragging
                      // This prevents click handlers from firing right after drag
                      if (clickTimerRef.current) {
                        clearTimeout(clickTimerRef.current);
                      }
                      
                      clickTimerRef.current = setTimeout(() => {
                        setIsDragging(false);
                      }, 100);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ top: 0, right: 0, padding: 16, minHeight: '40px', minWidth: '40px'}} // Default position: top-right
                  >
                    <motion.div 
                      className="bg-neutral-700/40 backdrop-blur-sm rounded-full overflow-hidden flex items-center justify-center gap-1"
                      layout
                      onClick={(e) => e.stopPropagation()}
                      initial={false}
                      animate={{
                        width: isToolbarCollapsed ? '40px' : 'auto',
                        height: isToolbarCollapsed ? '40px' : '40px',
                        padding: isToolbarCollapsed ? '0px' : '4px'
                      }}
                      transition={{ 
                        duration: 0.15,
                      }}
                    >
                      {/* Plus icon - only visible when collapsed */}
                      <motion.div
                        className="absolute w-[40px] h-[40px] flex items-center justify-center group hover:scale-110 transition-all duration-200"
                        initial={false}
                        animate={{
                          opacity: isToolbarCollapsed ? 1 : 0,
                        }}
                        transition={{ duration: 0.2 }}
                        style={{
                          pointerEvents: isToolbarCollapsed ? 'auto' : 'none',
                          cursor: 'pointer'
                        }}
                        onClick={handlePlusClick}
                      >
                        <Plus size={24} className="text-white/40 group-hover:text-white transition-all duration-200" />
                      </motion.div>

                      {/* Toolbar content - hidden when collapsed with zero width but still in DOM */}
                      <motion.div 
                        className="flex items-center justify-center"
                        initial={false}
                        animate={{
                          opacity: isToolbarCollapsed ? 0 : 1,
                          width: isToolbarCollapsed ? 40 : 'auto',
                        }}
                        transition={{ duration: 0.15 }}
                        style={{
                          pointerEvents: isToolbarCollapsed ? 'none' : 'auto',
                          overflow: 'hidden'
                        }}
                      >
                        <div 
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group cursor-move"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragControls.start(e);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleToolbarCollapse(e);
                          }}
                        >
                          <GripVertical 
                            size={18} 
                            className="text-white/70 group-hover:text-white"
                          />
                        </div>
                        
                        {showCode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSplitView(!isSplitView);
                              if (!isSplitView) {
                                minimizeSound.play();
                              } else {
                                maximizeSound.play();
                              }
                            }}
                            className="flex items-center justify-center px-2 h-8 hover:bg-white/10 rounded-full group text-sm font-geneva-12"
                            aria-label="Toggle split view"
                          >
                            <span className="text-white/70 group-hover:text-white">
                              {isSplitView ? "Split" : "Full"}
                            </span>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!showCode) {
                              setShowCode(true);
                              setIsSplitView(true);
                              maximizeSound.play();
                            } else {
                              setShowCode(false);
                              setIsSplitView(false);
                              minimizeSound.play();
                            }
                          }}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Toggle code"
                        >
                          <Code
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleSaveToDisk}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Save HTML to disk"
                        >
                          <Save
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Copy HTML code"
                        >
                          {copySuccess ? (
                            <Check
                              size={20}
                              className="text-white/70 group-hover:text-white"
                            />
                          ) : (
                            <Copy
                              size={20}
                              className="text-white/70 group-hover:text-white"
                            />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            minimizeSound.play();
                            setIsFullScreen(false);
                          }}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Exit fullscreen"
                        >
                          <Minimize
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
