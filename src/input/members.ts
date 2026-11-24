import {type ComponentType} from 'react'
import {type InputProps, type ObjectMember, type SchemaType} from 'sanity'

/** Field name a member belongs to, including `error` members for invalid field values. */
export function getMemberFieldName(member: ObjectMember): string | undefined {
  if (member.kind === 'field') return member.name
  if (member.kind === 'error') return member.fieldName
  return undefined
}

export function withInputComponent(
  member: ObjectMember,
  input: ComponentType<InputProps>,
  /** Replaces the member's label (Studio labels a field with its schema type's title). */
  options: {label?: {title?: string; description?: SchemaType['description']}} = {},
): ObjectMember {
  if (member.kind !== 'field') {
    return member
  }

  return {
    ...member,
    field: {
      ...member.field,
      schemaType: {
        ...member.field.schemaType,
        ...(options.label
          ? {title: options.label.title, description: options.label.description}
          : {}),
        components: {input},
      },
    },
  }
}
