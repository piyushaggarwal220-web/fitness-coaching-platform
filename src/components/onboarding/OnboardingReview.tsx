import type { OnboardingFormData } from '@/types/database'
import { buildReviewSections, type SavedPhotoUrls } from '@/lib/onboarding'
import { onboardingStyles as s } from './styles'

type OnboardingReviewProps = {
  form: OnboardingFormData
  photoUrls: SavedPhotoUrls
  onEditSection: (step: number) => void
  termsAccepted: boolean
  onTermsChange: (accepted: boolean) => void
}

const SECTION_EDIT_STEPS = [0, 2, 4, 7, 11, 13, 17, 20, 21] as const

export function OnboardingReview({
  form,
  photoUrls,
  onEditSection,
  termsAccepted,
  onTermsChange,
}: OnboardingReviewProps) {
  const sections = buildReviewSections(form, photoUrls)

  return (
    <div>
      <h2 style={s.stepTitle}>Review your answers</h2>
      <p style={s.stepHint}>
        Confirm everything looks correct before your coach builds your personalised plan.
      </p>

      {sections.map((section, index) => (
        <div key={section.title} style={s.reviewSection}>
          <h3 style={s.reviewTitle}>{section.title}</h3>
          {section.items.map((item) => (
            <div key={item.label} style={s.reviewRow}>
              <span style={s.reviewLabel}>{item.label}</span>
              <span style={s.reviewValue}>{item.value}</span>
            </div>
          ))}
          <button
            type="button"
            style={s.editLink}
            onClick={() => onEditSection(SECTION_EDIT_STEPS[index] ?? 0)}
          >
            Edit
          </button>
        </div>
      ))}

      <label style={s.termsBox}>
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => onTermsChange(e.target.checked)}
        />
        <span>
          I agree to the coaching terms, understand results depend on adherence, and confirm
          the health information provided is accurate.
        </span>
      </label>
    </div>
  )
}
