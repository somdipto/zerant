export interface Session {
  name: string;
  partition: string;       // "persist:session-{name}" or "persist:zerant" for default
  createdAt: number;
  isDefault: boolean;      // true only for "default" (the user's session)
}
