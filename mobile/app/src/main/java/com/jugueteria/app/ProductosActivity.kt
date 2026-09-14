package com.jugueteria.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.ListView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import org.json.JSONObject

class ProductosActivity : AppCompatActivity() {

    private var todos = listOf<JSONObject>()
    private var visibles = listOf<JSONObject>()
    private lateinit var adaptador: BaseAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.iniciar(this)
        setContentView(R.layout.activity_productos)
        findViewById<View>(R.id.btnVolver).setOnClickListener { finish() }

        adaptador = object : BaseAdapter() {
            override fun getCount() = visibles.size
            override fun getItem(i: Int) = visibles[i]
            override fun getItemId(i: Int) = visibles[i].getLong("id")
            override fun getView(i: Int, reciclada: View?, padre: ViewGroup): View {
                val fila = reciclada ?: layoutInflater.inflate(R.layout.item_producto, padre, false)
                val p = visibles[i]
                fila.findViewById<TextView>(R.id.colId).text = p.getInt("id").toString()
                fila.findViewById<TextView>(R.id.colNombre).text = p.getString("nombre")
                fila.findViewById<TextView>(R.id.colPrecio).text = pesos(p.getDouble("precio"))
                fila.findViewById<TextView>(R.id.colStock).text = p.getInt("stock").toString()
                return fila
            }
        }
        val lista = findViewById<ListView>(R.id.lista)
        lista.adapter = adaptador
        lista.setOnItemClickListener { _, _, i, _ ->
            startActivity(Intent(this, ProductoActivity::class.java).putExtra("id", visibles[i].getInt("id")))
        }

        findViewById<View>(R.id.btnNuevo).setOnClickListener {
            startActivity(Intent(this, ProductoActivity::class.java))
        }
        findViewById<EditText>(R.id.txtBuscar).doAfterTextChanged { filtrar(it.toString()) }
    }

    // Se recarga al volver de cargar/modificar un producto
    override fun onResume() {
        super.onResume()
        enSegundoPlano({ Api.listarProductos() }) { arreglo ->
            todos = (0 until arreglo.length()).map { arreglo.getJSONObject(it) }
            filtrar(findViewById<EditText>(R.id.txtBuscar).text.toString())
        }
    }

    private fun filtrar(texto: String) {
        val t = texto.trim()
        visibles = if (t.isEmpty()) todos else todos.filter {
            it.getString("nombre").contains(t, ignoreCase = true) || it.optString("codigo_barras").contains(t)
        }
        findViewById<TextView>(R.id.txtCantidad).text = "Productos (${todos.size}) :"
        findViewById<View>(R.id.txtVacio).visibility = if (visibles.isEmpty()) View.VISIBLE else View.GONE
        adaptador.notifyDataSetChanged()
    }
}
