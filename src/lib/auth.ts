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
        
        // Fetch latest tier from DB
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', token.sub)
            .single();
            
          if (data && !error) {
            (session.user as any).subscription_tier = data.subscription_tier;
          } else {
            (session.user as any).subscription_tier = 'free';
          }
        } catch (e) {
          (session.user as any).subscription_tier = 'free';
        }
      }
      return session;
    },
  },
};
