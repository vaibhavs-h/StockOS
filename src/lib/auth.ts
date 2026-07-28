import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { supabase } from "@/services/DatabaseClient";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      try {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: user.name,
            avatar_url: user.image,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (error) {
          console.error("[AUTH] Profile sync error:", error);
        }
        return true;
      } catch (err) {
        console.error("[AUTH] Unexpected error in signIn callback:", err);
        return true; // Still allow sign in
      }
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        
        // Fetch latest tier & expiration from DB
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('subscription_tier, subscription_expires_at')
            .eq('id', token.sub)
            .single();
            
          if (data && !error) {
            let activeTier = data.subscription_tier || 'free';
            let expiresAt = data.subscription_expires_at || null;

            // Check if subscription has expired
            if (expiresAt && new Date(expiresAt) <= new Date()) {
              activeTier = 'free';
              expiresAt = null;

              // Automatically revert DB profile to free
              await supabase
                .from('profiles')
                .update({
                  subscription_tier: 'free',
                  subscription_expires_at: null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', token.sub);
            }

            (session.user as any).subscription_tier = activeTier;
            (session.user as any).subscription_expires_at = expiresAt;
          } else {
            (session.user as any).subscription_tier = 'free';
            (session.user as any).subscription_expires_at = null;
          }
        } catch (e) {
          (session.user as any).subscription_tier = 'free';
          (session.user as any).subscription_expires_at = null;
        }
      }
      return session;
    },
  },
};
