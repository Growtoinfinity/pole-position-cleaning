import BrandLogo from '@/components/ui/BrandLogo'

export default function ResidentialFlatNotSupported() {
  return (
    <div className="w-full py-4 md:py-8">
      <div className="gm-card mx-auto max-w-2xl p-6 text-center md:p-8">
        <div className="flex w-full justify-center">
          <BrandLogo className="h-12 md:h-14" />
        </div>

        <h2 className="mt-8 text-xl md:text-2xl font-semibold text-brand-800">
          Sorry, we do not clean individual flats or maisonettes.
        </h2>

        <p className="mt-5 text-base text-ink-muted md:text-lg">
          If you believe your property should still be considered, please contact us.
        </p>
      </div>

      {/* Navigation buttons removed per requirements */}
    </div>
  )
}
