import { strictEqual, throws } from "assert";
import prettier from "prettier";
import * as plugin from "../../formatter/index.js";

function format(code: string): string {
  const output = prettier.format(code, {
    parser: "cadl",
    plugins: [plugin],
  });
  return output;
}

function assertFormat({ code, expected }: { code: string; expected: string }) {
  const result = format(code);
  strictEqual(result.trim(), expected.trim());
}

describe("compiler: prettier formatter", () => {
  it("throws error if there is a parsing issue", () => {
    const code = `namespace this is invalid`;

    throws(() => format(code));
  });

  it("format imports", () => {
    assertFormat({
      code: `
    import   "@scope/package1";
import        "@scope/package2";
import "@scope/package3"  ;
`,
      expected: `
import "@scope/package1";
import "@scope/package2";
import "@scope/package3";
`,
    });
  });

  it("formats returns of anonymous models", () => {
    assertFormat({
      code: `
op test(): { a: string; b: string; };
`,
      expected: `
op test(): {
  a: string;
  b: string;
};
`,
    });
  });

  it("format using", () => {
    assertFormat({
      code: `
using       Some.Namespace  
`,
      expected: `
using Some.Namespace;
`,
    });
  });

  describe("model", () => {
    it("format empty model on single line", () => {
      assertFormat({
        code: `
model Foo {
  

  
}
`,
        expected: `
model Foo {}
`,
      });
    });

    it("format simple models", () => {
      assertFormat({
        code: `
model Foo {
  id: number;
    type: Bar;

    name?:    string;
  isArray:      string[]  ;
}
`,
        expected: `
model Foo {
  id: number;
  type: Bar;
  name?: string;
  isArray: string[];
}
`,
      });
    });

    it("format nested models", () => {
      assertFormat({
        code: `
model Foo {
      id: number;
  address: { street: string, country:   string}
}
`,
        expected: `
model Foo {
  id: number;
  address: {
    street: string;
    country: string;
  };
}
`,
      });
    });

    it("format models with default values", () => {
      assertFormat({
        code: `
model Foo {

    name?:    string    =      "foo";
}
`,
        expected: `
model Foo {
  name?: string = "foo";
}
`,
      });
    });

    it("format models with spread", () => {
      assertFormat({
        code: `
model Foo {
    id: number;
      ...Bar;
  name: string;
}
`,
        expected: `
model Foo {
  id: number;
  ...Bar;
  name: string;
}
`,
      });
    });

    it("format model with decorator", () => {
      assertFormat({
        code: `
      @some @decorator
model   Foo {}
`,
        expected: `
@some
@decorator
model Foo {}
`,
      });
    });

    it("format model with heritage", () => {
      assertFormat({
        code: `
model   Foo extends Base {
}

model   Bar extends Base< 
  string    > {
}
`,
        expected: `
model Foo extends Base {}

model Bar extends Base<string> {}
`,
      });
    });

    it("format model with is", () => {
      assertFormat({
        code: `
model   Foo is Base {
}

model   Bar is Base< 
  string    > {
}
`,
        expected: `
model Foo is Base {}

model Bar is Base<string> {}
`,
      });
    });

    it("format model with generic", () => {
      assertFormat({
        code: `
model   Foo < T   >{
}
`,
        expected: `
model Foo<T> {}
`,
      });
    });

    it("format spread reference", () => {
      assertFormat({
        code: `
model Foo {
        ...       Bar


}
`,
        expected: `
model Foo {
  ...Bar;
}
`,
      });
    });

    it("remove unncessary quotes", () => {
      assertFormat({
        code: `
model Foo {
  "abc": string;
  "this-needs-quotes": int32;
}
`,
        expected: `
model Foo {
  abc: string;
  "this-needs-quotes": int32;
}
`,
      });
    });
  });

  describe("comments", () => {
    it("format comment at position 0", () => {
      assertFormat({
        code: `// This comment is at position 0.
model Foo {}
`,
        expected: `
// This comment is at position 0.
model Foo {}
`,
      });
    });

    it("format single line comments", () => {
      assertFormat({
        code: `
  // This is a comment.
model Foo {}
`,
        expected: `
// This is a comment.
model Foo {}
`,
      });
    });

    it("format indentable multi line comments", () => {
      assertFormat({
        code: `
  /**
 * This is a multiline comment
      * that has bad formatting.
    */
model Foo {}
`,
        expected: `
/**
 * This is a multiline comment
 * that has bad formatting.
 */
model Foo {}
`,
      });
    });

    it("format regular multi line comments", () => {
      assertFormat({
        code: `
  /**
  This is a multiline comment
       that has bad formatting.
    */
model Foo {}
`,
        expected: `
/**
  This is a multiline comment
       that has bad formatting.
    */
model Foo {}
`,
      });
    });

    it("format empty model with comment inside", () => {
      assertFormat({
        code: `
model Foo {
  // empty model

  
}
`,
        expected: `
model Foo {
  // empty model
}
`,
      });

      assertFormat({
        code: `
model Foo {
  // empty model 1


     // empty model 2

  
}
`,
        expected: `
model Foo {
  // empty model 1
  // empty model 2
}
`,
      });
    });

    it("format empty anynymous model with comment inside", () => {
      assertFormat({
        code: `
model Foo {
  nested: {
  // empty model

  }
}
`,
        expected: `
model Foo {
  nested: {
    // empty model
  };
}
`,
      });
    });

    it("format empty interface with comment inside", () => {
      assertFormat({
        code: `
interface Foo {
  // empty interface

  
}
`,
        expected: `
interface Foo {
  // empty interface
}
`,
      });

      assertFormat({
        code: `
interface Foo {
  // empty interface 1


     // empty interface 2

  
}
`,
        expected: `
interface Foo {
  // empty interface 1
  // empty interface 2
}
`,
      });
    });

    it("format comment between decorator and namespace statement", () => {
      assertFormat({
        code: `
@foo
// comment
namespace Bar;
`,
        expected: `
// comment
@foo
namespace Bar;
`,
      });
    });

    it("format comment between decorator and model statement", () => {
      assertFormat({
        code: `
@foo
// comment
model Bar {}
`,
        expected: `
// comment
@foo
model Bar {}
`,
      });
    });

    it("format comment between decorator and model property", () => {
      assertFormat({
        code: `
model Bar {
  @foo
// comment
myProp: string;
}
`,
        expected: `
model Bar {
  @foo
  // comment
  myProp: string;
}
`,
      });
    });
  });

  describe("alias union", () => {
    it("format simple alias", () => {
      assertFormat({
        code: `
alias     Foo   = "one"       | "two";
alias     Bar   
      = "one"      
     | "two";
`,
        expected: `
alias Foo = "one" | "two";
alias Bar = "one" | "two";
`,
      });
    });

    it("format generic alias", () => {
      assertFormat({
        code: `
alias     Foo<   A,     B>   = A     |    B;
alias     Bar<   
    A,     B>   = 
    A     |   
 B;
`,
        expected: `
alias Foo<A, B> = A | B;
alias Bar<A, B> = A | B;
`,
      });
    });

    it("format long alias", () => {
      assertFormat({
        code: `
alias VeryLong =   "one" | "two" | "three" | "four" | "five" | "six" | "seven" | "height" | "nine" | "ten";
`,
        expected: `
alias VeryLong =
  | "one"
  | "two"
  | "three"
  | "four"
  | "five"
  | "six"
  | "seven"
  | "height"
  | "nine"
  | "ten";
`,
      });
    });
  });

  describe("alias intersection", () => {
    it("format intersection of types", () => {
      assertFormat({
        code: `
alias     Foo   = One       &   Two;
alias     Bar   
      = One &
    Two;
`,
        expected: `
alias Foo = One & Two;
alias Bar = One & Two;
`,
      });
    });

    it("format intersection of anoymous models", () => {
      assertFormat({
        code: `
alias     Foo   = { foo: string }       &   {bar: string};
alias     Bar   
      = { foo: string }  &
    {
      bar: string};
`,
        expected: `
alias Foo = {
  foo: string;
} & {
  bar: string;
};
alias Bar = {
  foo: string;
} & {
  bar: string;
};
`,
      });
    });
  });

  describe("enum", () => {
    it("format simple enum", () => {
      assertFormat({
        code: `
enum      Foo       {    A,        B}
enum      Bar       
      {    A,    
            B}
`,
        expected: `
enum Foo {
  A,
  B,
}
enum Bar {
  A,
  B,
}
`,
      });
    });

    it("format named enum", () => {
      assertFormat({
        code: `
enum      Foo       {    A:   "a",        B    : "b"}
enum      Bar       
      {    A: "a",    
            B:      
            "b"}
`,
        expected: `
enum Foo {
  A: "a",
  B: "b",
}
enum Bar {
  A: "a",
  B: "b",
}
`,
      });
    });

    it("seperate members if there is decorators", () => {
      assertFormat({
        code: `
enum      Foo       {   
  @doc("foo") 
        A:   "a",    @doc("bar") 
           B    : "b", 



      @doc("third")   
       C    : "c"}

`,
        expected: `
enum Foo {
  @doc("foo")
  A: "a",

  @doc("bar")
  B: "b",

  @doc("third")
  C: "c",
}
`,
      });
    });
  });

  describe("namespaces", () => {
    it("format global namespace", () => {
      assertFormat({
        code: `
namespace     Foo;
`,
        expected: `
namespace Foo;
`,
      });
    });

    it("format global nested namespace", () => {
      assertFormat({
        code: `
namespace Foo     .   Bar;
`,
        expected: `
namespace Foo.Bar;
`,
      });
    });

    it("format global namespace with decorators", () => {
      assertFormat({
        code: `
  @service
    @other
namespace Foo     .   Bar;
`,
        expected: `
@service
@other
namespace Foo.Bar;
`,
      });
    });

    it("format namespace with body", () => {
      assertFormat({
        code: `
namespace     Foo { 
  op some(): string;
}


namespace Foo     .   Bar { 
  op some(): string;
}
`,
        expected: `
namespace Foo {
  op some(): string;
}

namespace Foo.Bar {
  op some(): string;
}
`,
      });
    });

    it("format nested namespaces", () => {
      assertFormat({
        code: `
namespace     Foo { 
namespace   Bar { 
op some(): string;
}
}


`,
        expected: `
namespace Foo {
  namespace Bar {
    op some(): string;
  }
}
`,
      });
    });
  });

  describe("string literals", () => {
    it("format single line string literal", () => {
      assertFormat({
        code: `
@doc(   "this is a doc.  "
 )
model Foo {}
`,
        expected: `
@doc("this is a doc.  ")
model Foo {}
`,
      });
    });

    it("format single line with newline characters", () => {
      assertFormat({
        code: `
@doc(   "foo\\nbar"
 )
model Foo {}
`,
        expected: `
@doc("foo\\nbar")
model Foo {}
`,
      });
    });

    it("format multi line string literal", () => {
      assertFormat({
        code: `
@doc(   """
  
this is a doc.  
 that 
 span
 multiple lines.
"""
 )
model Foo {}
`,
        expected: `
@doc("""
  
this is a doc.  
 that 
 span
 multiple lines.
""")
model Foo {}
`,
      });
    });
  });

  describe("number literals", () => {
    it("format integer", () => {
      assertFormat({
        code: `
alias MyNum =     123   ;
`,
        expected: `
alias MyNum = 123;
`,
      });
    });

    it("format float", () => {
      assertFormat({
        code: `
alias MyFloat1 =     1.234   ;
alias MyFloat2 =     0.123   ;
`,
        expected: `
alias MyFloat1 = 1.234;
alias MyFloat2 = 0.123;
`,
      });
    });

    it("format e notation numbers", () => {
      assertFormat({
        code: `
alias MyBigNumber =     1.0e8  ;
`,
        expected: `
alias MyBigNumber = 1.0e8;
`,
      });
    });

    it("format big numbers", () => {
      assertFormat({
        code: `
alias MyBigNumber =     1.0e999999999   ;
`,
        expected: `
alias MyBigNumber = 1.0e999999999;
`,
      });
    });
  });

  describe("recoverable error can be fixed", () => {
    it("adds missing ;", () => {
      assertFormat({
        code: `
alias Foo = string
model Bar {}
`,
        expected: `
alias Foo = string;
model Bar {}
`,
      });
    });

    it("adds missing } at the end of the file", () => {
      assertFormat({
        code: `
namespace Bar {
`,
        expected: `
namespace Bar {

}
`,
      });
    });
  });

  describe("directives", () => {
    it("keeps directive before a model", () => {
      assertFormat({
        code: `
  #suppress "some-error"    "because"
  
model Bar {}
`,
        expected: `
#suppress "some-error" "because"
model Bar {}
`,
      });
    });

    it("keeps directive before a model property", () => {
      assertFormat({
        code: `
        
        model Bar {
          
          #suppress   "some-error"   "because"
  id: string;
}
`,
        expected: `
model Bar {
  #suppress "some-error" "because"
  id: string;
}
`,
      });
    });

    it("keeps directive before a decorators", () => {
      assertFormat({
        code: `
  #suppress   "some-error"     "because"
    @decorate("args")
   @decorate()


namespace MyNamespace {}
`,
        expected: `
#suppress "some-error" "because"
@decorate("args")
@decorate
namespace MyNamespace {

}
`,
      });
    });
  });

  describe("decorators", () => {
    it("keep simple decorators inline", () => {
      assertFormat({
        code: `
namespace Foo {
  @route("inline")  op       simple(): string;
}
      `,
        expected: `
namespace Foo {
  @route("inline") op simple(): string;
}
      `,
      });
    });

    it("it preserve new line if provided", () => {
      assertFormat({
        code: `
namespace Foo {
  @route("inline")
         op  my(): string;
}
      `,
        expected: `
namespace Foo {
  @route("inline")
  op my(): string;
}
      `,
      });
    });

    it("split by new line if there is more than 2 decorator", () => {
      assertFormat({
        code: `
namespace Foo {
  @route("inline") @mark @bar op       my(): string;
}
      `,
        expected: `
namespace Foo {
  @route("inline")
  @mark
  @bar
  op my(): string;
}
      `,
      });
    });

    it("split decorator first if line is long", () => {
      assertFormat({
        code: `
namespace Foo {
  @doc("this is a very long documentation that will for sure overflow the max line length") op my(parm: string): string;
}
      `,
        expected: `
namespace Foo {
  @doc("this is a very long documentation that will for sure overflow the max line length")
  op my(parm: string): string;
}
      `,
      });
    });
  });

  describe("interfaces", () => {
    it("removes op prefix", () => {
      assertFormat({
        code: `
interface Foo {
  op foo(): int32;
}`,
        expected: `
interface Foo {
  foo(): int32;
}`,
      });
    });
  });

  describe("templated types", () => {
    it("format parameter declarations", () => {
      assertFormat({
        code: `
model Foo<   T  , K
> {
}`,
        expected: `
model Foo<T, K> {}`,
      });
    });

    it("format parameter declarations with defaults", () => {
      assertFormat({
        code: `
model Foo<   T  ="abc",    K =        134
> {
}`,
        expected: `
model Foo<T = "abc", K = 134> {}`,
      });
    });
  });

  describe("array expression", () => {
    it("format an array expression", () => {
      assertFormat({
        code: `
alias Foo = string       [];
`,
        expected: `
alias Foo = string[];
`,
      });
    });
  });

  describe("tuple expression", () => {
    it("format a single line tuple", () => {
      assertFormat({
        code: `
alias Foo = [string, 
  "abc",           134];
`,
        expected: `
alias Foo = [string, "abc", 134];
`,
      });
    });
    it("format a long tuple over multi line", () => {
      assertFormat({
        code: `
alias Foo = ["very long text that will overflow 1","very long text that will overflow 2", "very long text that will overflow 3" ];
`,
        expected: `
alias Foo = [
  "very long text that will overflow 1",
  "very long text that will overflow 2",
  "very long text that will overflow 3",
];
`,
      });
    });
  });

  describe("member expression", () => {
    it("a simple member expression", () => {
      assertFormat({
        code: `
model Foo {
  p: Some .     bar;
}
`,
        expected: `
model Foo {
  p: Some.bar;
}
`,
      });
    });
    it("nested member expression", () => {
      assertFormat({
        code: `
model Foo {
  p: Some . 
  Nested.     bar;
}
`,
        expected: `
model Foo {
  p: Some.Nested.bar;
}
`,
      });
    });
  });
});
