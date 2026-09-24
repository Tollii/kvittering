import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Ore } from "@/lib/domain/ore";
import { MoneyField } from "./money-field";

async function renderField(value: Ore | null = null) {
  const onChange = jest.fn<(value: Ore | null) => void>();
  const onError = jest.fn<(error: string | null) => void>();

  await render(
    <MoneyField
      label="Beløp"
      value={value}
      onChange={onChange}
      onError={onError}
    />,
  );

  return { input: screen.getByLabelText("Beløp"), onChange, onError };
}

describe("MoneyField", () => {
  test("shows the current amount in Norwegian format", async () => {
    const { input } = await renderField(Ore.of(1250));

    expect(input.props.value).toBe("12,50");
  });

  test("reports a typed amount in øre", async () => {
    const { input, onChange, onError } = await renderField();

    await fireEvent.changeText(input, "12,5");

    expect(onChange).toHaveBeenLastCalledWith(1250);
    expect(onError).toHaveBeenLastCalledWith(null);
  });

  test("keeps invalid text for correction without changing the amount", async () => {
    const { input, onChange, onError } = await renderField(Ore.of(1250));

    await fireEvent.changeText(input, "12,555");

    expect(input.props.value).toBe("12,555");
    expect(onChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenLastCalledWith(
      "Bruk et beløp med høyst to desimaler.",
    );
  });

  test("reports cleared text as an unknown amount", async () => {
    const { input, onChange } = await renderField(Ore.of(1250));

    await fireEvent.changeText(input, "");

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
