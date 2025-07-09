import React from "react";
import { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  CheckSquare,
  Mic,
} from "lucide-react";

interface EditorToolbarProps {
  editor: Editor | null;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  const getTextStyle = () => {
    if (editor.isActive("heading", { level: 1 })) return "heading1";
    if (editor.isActive("heading", { level: 2 })) return "heading2";
    if (editor.isActive("heading", { level: 3 })) return "heading3";
    return "paragraph";
  };

  const setTextStyle = (style: string) => {
    switch (style) {
      case "heading1":
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case "heading2":
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case "heading3":
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case "paragraph":
      default:
        editor.chain().focus().setParagraph().run();
        break;
    }
  };

  return (
    <div className="flex items-center gap-1 p-2 border-b border-gray-300 bg-gray-100 flex-wrap">
      {/* Format buttons */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={editor.isActive("bold") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="h-8 w-8 p-0 font-bold"
        >
          B
        </Button>
        <Button
          variant={editor.isActive("italic") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="h-8 w-8 p-0 italic"
        >
          I
        </Button>
        <Button
          variant={editor.isActive("underline") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className="h-8 w-8 p-0 underline"
        >
          U
        </Button>
      </div>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Text style selector */}
      <Select value={getTextStyle()} onValueChange={setTextStyle}>
        <SelectTrigger className="w-20 h-8 text-sm">
          <SelectValue placeholder="Text" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">Text</SelectItem>
          <SelectItem value="heading1">Title</SelectItem>
          <SelectItem value="heading2">Heading</SelectItem>
          <SelectItem value="heading3">Subhead</SelectItem>
        </SelectContent>
      </Select>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Alignment buttons */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={editor.isActive({ textAlign: "left" }) ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className="h-8 w-8 p-0"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          variant={editor.isActive({ textAlign: "center" }) ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className="h-8 w-8 p-0"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          variant={editor.isActive({ textAlign: "right" }) ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className="h-8 w-8 p-0"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* List buttons */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={editor.isActive("bulletList") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="h-8 w-8 p-0"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant={editor.isActive("orderedList") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="h-8 w-8 p-0"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          variant={editor.isActive("taskList") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className="h-8 w-8 p-0"
        >
          <CheckSquare className="h-4 w-4" />
        </Button>
      </div>

      {/* Voice/Recording button placeholder */}
      <div className="ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled
        >
          <Mic className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 