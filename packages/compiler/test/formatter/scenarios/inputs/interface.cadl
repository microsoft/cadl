interface
Foo {
  x (
    n: int32
  ) :
  string,
  y (x: int32, y: int32): int32
}

interface Bar    extends
ResourceOperations<BarResource> {
  blerp(n: int32): string;
}

interface Baz extends ResourceRead<BarResource>,

ResourceCreate<BarResource>,     ResourceDelete<BarResource>
  {
  glorp(n: int32): string;
}


interface WithMultipleOperation {

  keepSeparation1(): string;


  
  keepSeperation2(): string;
}
