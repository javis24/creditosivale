import { describe, expect, it } from "vitest";
import { deleteClientSchema, updateClientSchema } from "@/lib/validation";

const validClient = {
  firstName: "Manases",
  paternalLastName: "Ramirez",
  maternalLastName: "Ramirez",
  email: "",
  phone: "871 986 2455",
  status: "activo",
  birthDate: "1990-01-10",
  curp: "",
  rfc: "",
  ineNumber: "",
  gender: "no_especificado",
  maritalStatus: "",
  occupation: "",
  companyName: "",
  monthlyIncome: "0",
  address: "Domicilio registrado por el cliente",
  street: "",
  exteriorNumber: "",
  interiorNumber: "",
  neighborhood: "",
  postalCode: "35000",
  city: "",
  state: "",
  country: "México",
  emergencyContactName: "",
  emergencyContactPhone: "",
  notes: "",
};

describe("administración de clientes", () => {
  it("acepta editar un cliente creado mediante el registro público", () => {
    const result = updateClientSchema.parse(validClient);

    expect(result.email).toBeNull();
    expect(result.monthlyIncome).toBe(0);
    expect(result.occupation).toBeNull();
  });

  it("rechaza un código postal incompleto", () => {
    const result = updateClientSchema.safeParse({
      ...validClient,
      postalCode: "3500",
    });

    expect(result.success).toBe(false);
  });

  it("exige la confirmación literal para eliminar", () => {
    expect(deleteClientSchema.safeParse({ confirmation: "eliminar" }).success).toBe(false);
    expect(deleteClientSchema.safeParse({ confirmation: "ELIMINAR" }).success).toBe(true);
  });
});
