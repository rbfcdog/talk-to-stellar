import Link from "next/link"
import { Button } from "@/components/ui/button"

export function CTASection() {
  return (
    <section className="bg-white py-20 lg:py-24 border-t border-gray-200">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-3xl font-light tracking-tight lg:text-4xl text-gray-900">
            Ready to use TalkToStellar?
          </h2>
          <p className="text-balance text-lg text-gray-600 font-light leading-relaxed mb-8">
            Start from the same unified frontend. Landing and chat now live in one app.
          </p>

          <div className="flex justify-center">
            <Link href="/chat">
              <Button className="bg-gray-900 hover:bg-gray-800 text-white rounded-full px-8 py-3 text-base">
                Open Chat
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
