export type ChatMessage = {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
};

export type ChatRoom = {
  id: string;
  name: string;
  type?: "public" | "private"; // optional for backward compatibility
  createdAt: number;
  userCount: number;
  users?: string[];
  members?: string[]; // for private rooms - list of usernames who can access
};

export type User = {
  username: string;
  lastActive: number;
};
