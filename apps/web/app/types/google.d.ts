interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
  prompt: () => void;
}

interface GoogleAccounts {
  id: GoogleAccountsId;
}

interface GoogleGlobal {
  accounts: GoogleAccounts;
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

export {};
