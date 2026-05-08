export { default } from "next-auth/middleware"

export const config = { matcher: ["/dashboard/:path*", "/journal/:path*", "/stocks/:path*", "/us-stocks/:path*"] }
