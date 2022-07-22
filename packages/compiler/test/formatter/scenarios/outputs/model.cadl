model Empty {}

model WithProps {
  foo: string;
  bar: string;
}

model WithSpreadAndProps {
  foo: string;
  ...WithProps;
  other: int16;
}

model GenericExtension<T> extends Parent<T> {}

model Foo<
  T extends string,
  K extends {
    foo: int32;
    some: string;
    eveneveneveneveneveneven: string;
    someveryveryveryveryverylong: string;
  }
> {}
