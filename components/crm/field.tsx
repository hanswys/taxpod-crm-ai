import { Label } from "@/components/ui/label";

/** Label + control + first validation error. `name` links the label and the error to the input. */
export function Field({
  name,
  label,
  errors,
  children,
}: {
  name: string;
  label: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {errors?.[0] && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

/** Props for an input inside <Field>, so screen readers announce the error. */
export function fieldProps(name: string, errors?: string[]) {
  return {
    id: name,
    name,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": errors?.length ? `${name}-error` : undefined,
  };
}
